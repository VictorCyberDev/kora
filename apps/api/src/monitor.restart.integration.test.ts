import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import type { TelemetryObservation } from "@kora/incident-engine";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { quietLogger, testConfig } from "./test-support/monitor-harness.js";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (sql) await sql.end();
});

const config = testConfig({
  MONITOR_FAILURE_THRESHOLD: 3,
  MONITOR_RECOVERY_THRESHOLD: 3,
});

async function setup(status: { current: number }) {
  const store = new KoraStore(sql!);
  const service = await store.ensureService(
    `restart-${crypto.randomUUID()}`,
    "http://x.test/health",
  );
  const serviceId = String(service.id);
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response("", { status: status.current })),
  );
  vi.stubGlobal("fetch", fetchMock);
  const monitor = () =>
    new HealthMonitor(config, store, quietLogger, serviceId);
  return { store, serviceId, fetchMock, monitor };
}
const incidentsOf = (serviceId: string) =>
  sql!`SELECT id,state,severity,started_at,resolved_at FROM incidents WHERE service_id=${serviceId} ORDER BY created_at`;
const evidenceOf = (incidentId: string) =>
  sql!`SELECT evidence_kind,threshold_count,observation_id FROM incident_evidence WHERE incident_id=${incidentId} ORDER BY threshold_count`;
const eventsOf = (serviceId: string, type: string) =>
  sql!`SELECT event_id,correlation_id,payload FROM domain_events WHERE service_id=${serviceId} AND event_type=${type}`;
const memoryOf = (monitor: HealthMonitor) =>
  (
    monitor as unknown as {
      state: {
        activeIncident: { id: string } | null;
        consecutiveFailures: number;
      };
    }
  ).state;

describe.skipIf(!databaseUrl)("restart durability", () => {
  it("a fresh monitor continues and resolves the incident opened before the restart", async () => {
    const status = { current: 503 };
    const { serviceId, monitor } = await setup(status);
    const first = monitor();
    for (let i = 0; i < 3; i++) await first.checkOnce();
    const [incident] = await incidentsOf(serviceId);
    expect(incident?.state).toBe("DETECTED");
    const original = {
      id: String(incident!.id),
      severity: String(incident!.severity),
      startedAt: new Date(incident!.started_at as string).getTime(),
    };

    // Process restart: new monitor, empty memory, same database.
    const second = monitor();
    await second.checkOnce();
    await second.checkOnce();

    let incidents = await incidentsOf(serviceId);
    expect(incidents).toHaveLength(1);
    expect(String(incidents[0]!.id)).toBe(original.id);
    expect(String(incidents[0]!.severity)).toBe(original.severity);
    expect(new Date(incidents[0]!.started_at as string).getTime()).toBe(
      original.startedAt,
    );
    const counts = (await evidenceOf(original.id)).map((e) =>
      Number(e.threshold_count),
    );
    expect(counts).toEqual([1, 2, 3, 4, 5]); // monotonic across the restart
    expect((await eventsOf(serviceId, "IncidentUpdated")).length).toBe(2);

    // Recovery needs the full configured success count observed after restart.
    status.current = 200;
    await second.checkOnce();
    await second.checkOnce();
    incidents = await incidentsOf(serviceId);
    expect(incidents[0]!.state).toBe("DETECTED");
    await second.checkOnce();
    incidents = await incidentsOf(serviceId);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.state).toBe("RESOLVED");
    expect(incidents[0]!.resolved_at).not.toBeNull();
    const verified = await eventsOf(serviceId, "RecoveryVerified");
    expect(verified).toHaveLength(1);
    expect(String(verified[0]!.correlation_id)).toBe(original.id);
  });

  it("does not hydrate a resolved incident (a new outage opens a new incident)", async () => {
    const status = { current: 503 };
    const { serviceId, monitor } = await setup(status);
    const first = monitor();
    for (let i = 0; i < 3; i++) await first.checkOnce();
    status.current = 200;
    for (let i = 0; i < 3; i++) await first.checkOnce();
    status.current = 503;
    const second = monitor();
    for (let i = 0; i < 3; i++) await second.checkOnce();
    const incidents = await incidentsOf(serviceId);
    expect(incidents.map((i) => String(i.state))).toEqual([
      "RESOLVED",
      "DETECTED",
    ]);
  });

  it("pre-incident failure streaks are not persisted and restart at zero", async () => {
    const status = { current: 503 };
    const { serviceId, monitor } = await setup(status);
    const first = monitor();
    await first.checkOnce();
    await first.checkOnce(); // 2 of 3
    const second = monitor();
    await second.checkOnce(); // streak restarts: 1 of 3
    await second.checkOnce(); // 2 of 3
    expect(await incidentsOf(serviceId)).toHaveLength(0);
    await second.checkOnce(); // 3 of 3
    expect(await incidentsOf(serviceId)).toHaveLength(1);
  });

  describe("unique-index reconciliation", () => {
    /** Second process opens incident A after this monitor loaded its state. */
    async function raceWithAnotherWorker() {
      const status = { current: 503 };
      const ctx = await setup(status);
      const stale = ctx.monitor();
      await stale.checkOnce(); // hydrates (nothing open), streak 1
      await stale.checkOnce(); // streak 2
      const other = ctx.monitor();
      // The other worker needs its own three failures to open A.
      await other.checkOnce();
      await other.checkOnce();
      await other.checkOnce();
      const [a] = await incidentsOf(ctx.serviceId);
      return { ...ctx, stale, status, incidentId: String(a!.id) };
    }

    it("replays the same observation once without another fetch", async () => {
      const { serviceId, fetchMock, stale, incidentId } =
        await raceWithAnotherWorker();
      const createIncident = vi.spyOn(KoraStore.prototype, "createIncident");
      const fetchesBefore = fetchMock.mock.calls.length;
      const observation: TelemetryObservation = await stale.checkOnce(); // 3rd failure -> 23505

      expect(fetchMock.mock.calls.length - fetchesBefore).toBe(1); // no re-fetch
      expect(createIncident).toHaveBeenCalledTimes(1); // at most one retry, no second create
      expect(await incidentsOf(serviceId)).toHaveLength(1);
      const persisted =
        await sql!`SELECT count(*)::int n FROM telemetry_observations WHERE id=${observation.id}`;
      expect(persisted[0]!.n).toBe(1);
      const attached =
        await sql!`SELECT evidence_kind FROM incident_evidence WHERE incident_id=${incidentId} AND observation_id=${observation.id}`;
      expect(attached.map((r) => String(r.evidence_kind))).toEqual(["ongoing"]);
      const healthEvents =
        await sql!`SELECT count(*)::int n FROM domain_events WHERE payload->>'observationId'=${observation.id} AND event_type='HealthCheckFailed'`;
      expect(healthEvents[0]!.n).toBe(1);
      expect(memoryOf(stale).activeIncident?.id).toBe(incidentId);
    });

    it("leaves in-memory state at the last committed state when reconciliation fails", async () => {
      const { stale, incidentId, status } = await raceWithAnotherWorker();
      const before = { ...memoryOf(stale) };
      vi.spyOn(KoraStore.prototype, "appendEvidence").mockRejectedValueOnce(
        new Error("injected reconcile failure"),
      );
      await expect(stale.checkOnce()).rejects.toThrow(
        "injected reconcile failure",
      );
      expect(memoryOf(stale).activeIncident).toBeNull(); // no phantom incident
      expect(memoryOf(stale).consecutiveFailures).toBe(
        before.consecutiveFailures,
      );
      // Next tick proceeds normally and attaches to the real incident.
      status.current = 503;
      await stale.checkOnce();
      expect(memoryOf(stale).activeIncident?.id).toBe(incidentId);
    });
  });
});
