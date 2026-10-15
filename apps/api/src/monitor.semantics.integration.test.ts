import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { quietLogger, testConfig } from "./test-support/monitor-harness.js";

/**
 * Characterization of the event contract that downstream readers (the
 * incident timeline and the Milestone 3 diagnosis snapshot) rely on. These
 * assertions describe the behaviour BEFORE R0.3 and must keep passing after.
 */
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (sql) await sql.end();
});

interface EventShape {
  type: string;
  correlation: "none" | "incident";
  keys: string[];
}

describe.skipIf(!databaseUrl)(
  "monitor event contract (characterization)",
  () => {
    it("emits the documented events, order, correlation and payload keys", async () => {
      const store = new KoraStore(sql!);
      const name = `semantics-${crypto.randomUUID()}`;
      const service = await store.ensureService(name, "http://x.test/health");
      const serviceId = String(service.id);
      const statuses = [503, 503, 503, 200, 200];
      let n = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(new Response("", { status: statuses[n++] ?? 200 })),
        ),
      );
      const monitor = new HealthMonitor(
        testConfig({
          MONITOR_FAILURE_THRESHOLD: 2,
          MONITOR_RECOVERY_THRESHOLD: 2,
        }),
        store,
        quietLogger,
        serviceId,
      );
      const perCheck: EventShape[][] = [];
      const observations: string[] = [];
      let incidentId: string | null = null;
      let seen = 0;
      const eventsInInsertionOrder = () =>
        sql!`SELECT event_type,correlation_id,payload,occurred_at FROM domain_events WHERE service_id=${serviceId} ORDER BY created_at,ctid`;
      for (let i = 0; i < statuses.length; i++) {
        const obs = await monitor.checkOnce();
        observations.push(obs.id);
        const rows = await eventsInInsertionOrder();
        const fresh = rows.slice(seen);
        seen = rows.length;
        const created = fresh.find((r) => r.event_type === "IncidentCreated");
        if (created) incidentId = String(created.correlation_id);
        perCheck.push(
          fresh.map((r) => ({
            type: String(r.event_type),
            correlation:
              r.correlation_id === null
                ? "none"
                : String(r.correlation_id) === incidentId
                  ? "incident"
                  : "none",
            keys: Object.keys(r.payload as object).sort(),
          })),
        );
      }
      const healthKeys = [
        "failureCategory",
        "failureReason",
        "httpStatus",
        "latencyMs",
        "observationId",
        "resourceId",
        "timedOut",
      ];
      expect(perCheck).toEqual([
        // check 1: failure below threshold, no incident yet
        [{ type: "HealthCheckFailed", correlation: "none", keys: healthKeys }],
        // check 2: threshold crossed. The health event correlates to the incident
        // active BEFORE evaluation (none); IncidentCreated correlates to the new one.
        [
          { type: "HealthCheckFailed", correlation: "none", keys: healthKeys },
          {
            type: "IncidentCreated",
            correlation: "incident",
            keys: [
              "deduplicationKey",
              "resourceId",
              "severity",
              "triggerObservationIds",
            ],
          },
        ],
        // check 3: ongoing failure with the incident already active
        [
          {
            type: "HealthCheckFailed",
            correlation: "incident",
            keys: healthKeys,
          },
          {
            type: "IncidentUpdated",
            correlation: "incident",
            keys: ["observationId", "resourceId"],
          },
        ],
        // check 4: first success, recovery not yet verified
        [
          {
            type: "HealthCheckSucceeded",
            correlation: "incident",
            keys: healthKeys,
          },
        ],
        // check 5: recovery threshold reached. The health event still correlates
        // to the incident that was active before this observation.
        [
          {
            type: "HealthCheckSucceeded",
            correlation: "incident",
            keys: healthKeys,
          },
          {
            type: "RecoveryVerified",
            correlation: "incident",
            keys: ["recoveryObservationIds", "resolvedAt", "resourceId"],
          },
        ],
      ]);

      const rows = await eventsInInsertionOrder();
      const created = rows.find((r) => r.event_type === "IncidentCreated")!;
      const payload = created.payload as {
        triggerObservationIds: string[];
        deduplicationKey: string;
      };
      expect(payload.triggerObservationIds).toEqual(observations.slice(0, 2));
      expect(payload.deduplicationKey).toBe(
        `${serviceId}:health-check-unhealthy`,
      );
      const recovered = rows.find((r) => r.event_type === "RecoveryVerified")!;
      expect(
        (recovered.payload as { recoveryObservationIds: string[] })
          .recoveryObservationIds,
      ).toEqual(observations.slice(3, 5));
      // Timing: IncidentCreated is not earlier than the threshold observation.
      const incident = (
        await sql!`SELECT started_at,state,resolved_at FROM incidents WHERE id=${incidentId}`
      )[0]!;
      const obsRows =
        await sql!`SELECT id,observed_at FROM telemetry_observations WHERE service_id=${serviceId} ORDER BY observed_at`;
      expect(new Date(incident.started_at as string).getTime()).toBe(
        new Date(obsRows[0]!.observed_at as string).getTime(),
      );
      expect(
        new Date(created.occurred_at as string).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(obsRows[1]!.observed_at as string).getTime(),
      );
      expect(incident.state).toBe("RESOLVED");
      expect(incident.resolved_at).not.toBeNull();
      // Evidence: trigger threshold_count 1..K, ongoing continues, recovery 1..R.
      const evidence =
        await sql!`SELECT evidence_kind,threshold_count FROM incident_evidence WHERE incident_id=${incidentId} ORDER BY evidence_kind,threshold_count`;
      expect(
        evidence.map((e) => [
          String(e.evidence_kind),
          Number(e.threshold_count),
        ]),
      ).toEqual([
        ["ongoing", 3],
        ["recovery", 1],
        ["recovery", 2],
        ["trigger", 1],
        ["trigger", 2],
      ]);
    });
  },
);
