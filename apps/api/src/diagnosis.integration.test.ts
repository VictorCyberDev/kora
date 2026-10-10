import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { KoraStore } from "./store.js";
import { buildApi } from "./app.js";
import type { IncidentSnapshot, TelemetryObservation } from "@kora/incident-engine";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
afterAll(async () => { if (sql) await sql.end(); });

async function fixture() {
  const service = await store!.ensureService(`diagnosis-${crypto.randomUUID()}`, "http://example.invalid/health");
  const serviceId = String(service.id);
  const resource = await store!.ensureProviderResource({
    provider: "rumptycloud",
    providerAccount: `workspace-${crypto.randomUUID()}`,
    region: "verified-test-region",
    resourceType: "virtual_machine",
    providerResourceId: `rc-${crypto.randomUUID()}`,
    displayName: "diagnosis-test",
    environment: "test",
    status: "RUNNING",
    metadata: {},
  });
  await store!.bindServiceToResource(serviceId, String(resource.id));
  const observations: TelemetryObservation[] = [0, 1, 2].map((n) => ({
    id: crypto.randomUUID(), serviceId, observedAt: new Date(Date.now() + n).toISOString(), healthy: false,
    httpStatus: 503, latencyMs: 10, timedOut: false, failureReason: "health endpoint returned 503",
    failureCategory: "HTTP_5XX", resourceId: String(resource.id), providerStatus: "RUNNING",
  }));
  for (const observation of observations) await store!.recordObservation(observation);
  const incident: IncidentSnapshot = {
    id: crypto.randomUUID(), serviceId, deduplicationKey: `${serviceId}:health-check-unhealthy`, state: "DETECTED",
    severity: "HIGH", startedAt: observations[2]!.observedAt, resolvedAt: null, evidence: observations, recoveryEvidence: [],
  };
  await store!.createIncident(incident);
  return { incident, observations };
}

describe.skipIf(!databaseUrl)("diagnostic persistence", () => {
  it("persists a deterministic provider-aware diagnostic snapshot", async () => {
    const { incident } = await fixture();
    const snapshot = await store!.createDiagnosticSnapshot(incident.id);
    expect(snapshot?.findings.map((f) => f.code)).toContain("SERVICE_HTTP_5XX");
    expect(snapshot?.contradictions[0]?.code).toBe("RESOURCE_RUNNING_SERVICE_UNHEALTHY");
    expect(snapshot?.rootCause.state).toBe("UNKNOWN");
    expect(snapshot?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("deduplicates equivalent snapshots and rejects mutation", async () => {
    const { incident } = await fixture();
    const first = await store!.createDiagnosticSnapshot(incident.id);
    const second = await store!.createDiagnosticSnapshot(incident.id);
    expect(second?.snapshotId).toBe(first?.snapshotId);
    await expect(sql!`UPDATE diagnostic_snapshots SET content_hash=${"0".repeat(64)} WHERE id=${first!.snapshotId}`).rejects.toThrow(/immutable/i);
  });
  it("exposes diagnosis and persisted snapshot through the API", async () => {
    const { incident } = await fixture();
    const app = buildApi(store!, "test");
    const diagnosis = await app.inject(`/incidents/${incident.id}/diagnosis`);
    expect(diagnosis.statusCode).toBe(200);
    const body = diagnosis.json<{ data: { snapshotId: string; rootCause: { state: string } } }>();
    expect(body.data.rootCause.state).toBe("UNKNOWN");
    const list = await app.inject(`/incidents/${incident.id}/snapshots`);
    expect(list.statusCode).toBe(200);
    expect(list.json<{ data: unknown[] }>().data.length).toBeGreaterThan(0);
    const detail = await app.inject(`/incidents/${incident.id}/snapshots/${body.data.snapshotId}`);
    expect(detail.statusCode).toBe(200);
    await app.close();
  });
});
