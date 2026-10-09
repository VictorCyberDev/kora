import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import postgres from "postgres";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { buildApi } from "./app.js";
import type { KoraConfig } from "./config.js";
import type {
  IncidentSnapshot,
  TelemetryObservation,
} from "@kora/incident-engine";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as FastifyBaseLogger;
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (sql) await sql.end();
});

describe.skipIf(!databaseUrl)("PostgreSQL persistence", () => {
  it("persists an incident and its structured triggering evidence", async () => {
    const service = await store!.ensureService(
      `integration-${crypto.randomUUID()}`,
      "http://example.invalid/health",
    );
    const serviceId = String(service.id);
    const observation: TelemetryObservation = {
      id: crypto.randomUUID(),
      serviceId,
      observedAt: new Date().toISOString(),
      healthy: false,
      httpStatus: 503,
      latencyMs: 12,
      timedOut: false,
      failureReason: "health endpoint returned 503",
      failureCategory: "http",
    };
    await store!.recordObservation(observation);
    const incident: IncidentSnapshot = {
      id: crypto.randomUUID(),
      serviceId,
      deduplicationKey: `${serviceId}:health-check-unhealthy`,
      state: "DETECTED",
      severity: "HIGH",
      startedAt: observation.observedAt,
      resolvedAt: null,
      evidence: [observation],
      recoveryEvidence: [],
    };
    await store!.createIncident(incident);
    expect((await store!.getIncident(incident.id))?.id).toBe(incident.id);
    const evidence = await store!.getIncidentEvidence(incident.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidence_kind).toBe("trigger");
    expect(evidence[0]?.observation_id).toBe(observation.id);
  });

  it("persists the full failure and recovery lifecycle", async () => {
    const service = await store!.ensureService(
      `vertical-${crypto.randomUUID()}`,
      "http://demo.test/health",
    );
    const serviceId = String(service.id);
    const config: KoraConfig = {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: databaseUrl!,
      API_HOST: "127.0.0.1",
      API_PORT: 3000,
      MONITOR_ENABLED: false,
      MONITOR_SERVICE_NAME: "vertical-test",
      MONITOR_HEALTH_URL: "http://demo.test/health",
      MONITOR_INTERVAL_MS: 1000,
      MONITOR_TIMEOUT_MS: 500,
      MONITOR_FAILURE_THRESHOLD: 3,
      MONITOR_RECOVERY_THRESHOLD: 3,
    };
    const statuses = [200, 503, 503, 503, 503, 200, 200, 200];
    let index = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const status = statuses[index++] ?? 200;
        return Promise.resolve(new Response("", { status }));
      }),
    );
    const monitor = new HealthMonitor(config, store!, logger, serviceId);

    for (let n = 0; n < 5; n++) await monitor.checkOnce();

    const active = (await store!.listIncidents()).filter(
      (row) => row.service_id === serviceId && row.state !== "RESOLVED",
    );
    expect(active).toHaveLength(1);
    const incidentId = String(active[0]!.id);
    const observationsAfterFailure = await sql!`
      SELECT id, healthy FROM telemetry_observations
      WHERE service_id = ${serviceId}
      ORDER BY observed_at
    `;
    expect(observationsAfterFailure).toHaveLength(5);
    const failedObservations = observationsAfterFailure.filter(
      (row) => !row.healthy,
    );
    expect(failedObservations).toHaveLength(4);
    const failureEvidence = await store!.getIncidentEvidence(incidentId);
    const triggerEvidence = failureEvidence.filter(
      (row) => row.evidence_kind === "trigger",
    );
    const ongoingEvidence = failureEvidence.filter(
      (row) => row.evidence_kind === "ongoing",
    );
    expect(triggerEvidence).toHaveLength(3);
    expect(ongoingEvidence).toHaveLength(1);

    for (let n = 0; n < 3; n++) await monitor.checkOnce();

    const incident = await store!.getIncident(incidentId);
    expect(incident?.state).toBe("RESOLVED");
    expect(incident?.resolved_at).not.toBeNull();
    const finalEvidence = await store!.getIncidentEvidence(incidentId);
    const recoveryEvidence = finalEvidence.filter(
      (row) => row.evidence_kind === "recovery",
    );
    expect(recoveryEvidence).toHaveLength(3);
    const events = await store!.getIncidentEvents(incidentId);
    const createdEvents = events.filter(
      (row) => row.event_type === "IncidentCreated",
    );
    const recoveryEvents = events.filter(
      (row) => row.event_type === "RecoveryVerified",
    );
    expect(createdEvents).toHaveLength(1);
    expect(recoveryEvents).toHaveLength(1);

    const app = buildApi(store!, "test");
    const servicesResponse = await app.inject("/services");
    const services = servicesResponse.json<{ data: Array<{ id: string }> }>();
    expect(services.data.some((item) => item.id === serviceId)).toBe(true);
    const incidentResponse = await app.inject(`/incidents/${incidentId}`);
    expect(incidentResponse.statusCode).toBe(200);
    const incidentBody = incidentResponse.json<{ data: { state: string } }>();
    expect(incidentBody.data.state).toBe("RESOLVED");
    const evidencePath = `/incidents/${incidentId}/evidence`;
    const evidenceResponse = await app.inject(evidencePath);
    expect(evidenceResponse.statusCode).toBe(200);
    expect(evidenceResponse.json<{ data: unknown[] }>().data).toHaveLength(7);
    const eventsPath = `/incidents/${incidentId}/events`;
    const eventsResponse = await app.inject(eventsPath);
    expect(eventsResponse.statusCode).toBe(200);
    const eventsBody = eventsResponse.json<{
      data: Array<{ event_type: string }>;
    }>();
    const recoveryExposed = eventsBody.data.some(
      (item) => item.event_type === "RecoveryVerified",
    );
    expect(recoveryExposed).toBe(true);
    await app.close();
  });
});
