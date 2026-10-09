import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { KoraStore } from "./store.js";
import { HealthMonitor } from "./monitor.js";
import { RumptyCloudProvider } from "./providers/rumptycloud.js";
import { buildApi } from "./app.js";
import type { KoraConfig } from "./config.js";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const sql = databaseUrl ? postgres(databaseUrl) : null;
const store = sql ? new KoraStore(sql) : null;
const config: KoraConfig = {
  NODE_ENV: "test", LOG_LEVEL: "silent",
  DATABASE_URL: databaseUrl ?? "postgresql://unused:unused@localhost/unused",
  API_HOST: "127.0.0.1", API_PORT: 3000, MONITOR_ENABLED: false,
  MONITOR_SERVICE_NAME: "rumpty-e2e",
  MONITOR_HEALTH_URL: "https://rumpty-demo.example/health",
  MONITOR_INTERVAL_MS: 1000, MONITOR_TIMEOUT_MS: 500,
  MONITOR_FAILURE_THRESHOLD: 3, MONITOR_RECOVERY_THRESHOLD: 3,
  KORA_ENVIRONMENT: "test",
};
const logger = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;

suite("provider-aware PostgreSQL vertical slice", () => {
  beforeAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM domain_events`;
    await sql`DELETE FROM incident_evidence`;
    await sql`DELETE FROM incidents`;
    await sql`DELETE FROM telemetry_observations`;
    await sql`DELETE FROM service_resource_bindings`;
    await sql`DELETE FROM provider_resources`;
    await sql`DELETE FROM services`;
  });
  afterAll(async () => { vi.unstubAllGlobals(); if (sql) await sql.end(); });

  it("persists stable RumptyCloud resource identity and service binding", async () => {
    if (!store) throw new Error("DATABASE_URL required");
    const service = await store.ensureService("rumpty-e2e", config.MONITOR_HEALTH_URL);
    const resource = new RumptyCloudProvider().normalizeResource({
      workspace: "kora", region: "lagos", resourceType: "virtual_machine",
      resourceId: "vm-test-123", displayName: "kora-demo", environment: "test",
      publicUrl: "https://rumpty-demo.example", healthPath: "/health",
    });
    const stored = await store.ensureProviderResource(resource);
    await store.bindServiceToResource(String(service.id), String(stored.id));
    const fetched = await store.getService(String(service.id));
    expect(fetched?.resource).toMatchObject({ provider: "rumptycloud", providerResourceId: "vm-test-123", region: "lagos", environment: "test" });
  });

  it("proves incident, evidence, timeline and verified recovery with real PostgreSQL", async () => {
    if (!store || !sql) throw new Error("DATABASE_URL required");
    const service = (await store.listServices())[0]!;
    const resourceId = String((service.resource as { id: string }).id);
    const statuses = [200, 503, 503, 503, 503, 200, 200, 200];
    let index = 0;
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: statuses[index++] ?? 200 }))));
    const monitor = new HealthMonitor(config, store, logger, String(service.id), resourceId);
    for (let n = 0; n < statuses.length; n++) await monitor.checkOnce();
    const incidents = await store.listIncidents();
    expect(incidents).toHaveLength(1);
    const incident = incidents[0]!;
    expect(incident.state).toBe("RESOLVED");
    expect(incident.resource).toMatchObject({ provider: "rumptycloud", providerResourceId: "vm-test-123" });
    const observations = await sql`SELECT * FROM telemetry_observations WHERE service_id=${service.id} ORDER BY observed_at`;
    expect(observations).toHaveLength(8);
    expect(observations.every((row) => String(row.resource_id) === resourceId)).toBe(true);
    const evidence = await store.getIncidentEvidence(String(incident.id));
    expect(evidence.length).toBeGreaterThanOrEqual(7);
    const events = await store.getIncidentEvents(String(incident.id));
    expect(events.filter((row) => row.event_type === "IncidentCreated")).toHaveLength(1);
    expect(events.filter((row) => row.event_type === "RecoveryVerified")).toHaveLength(1);
    const timeline = await store.getIncidentTimeline(String(incident.id));
    expect(timeline.some((row) => row.event_type === "RecoveryVerified")).toBe(true);
    const api = buildApi(store, "test", "silent");
    const response = await api.inject({ method: "GET", url: `/incidents/${incident.id}/timeline` });
    expect(response.statusCode).toBe(200);
    await api.close();
  });
});
