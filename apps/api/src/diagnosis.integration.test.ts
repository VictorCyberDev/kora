import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { KoraStore } from "./store.js";
import { buildApi } from "./app.js";
import { deterministicHash, verifyDiagnosticSnapshot } from "./diagnosis.js";
import type {
  IncidentSnapshot,
  TelemetryObservation,
} from "@kora/incident-engine";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
afterAll(async () => {
  if (sql) await sql.end();
});

async function fixture() {
  const service = await store!.ensureService(
    `diagnosis-${crypto.randomUUID()}`,
    "http://example.invalid/health",
  );
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
    id: crypto.randomUUID(),
    serviceId,
    observedAt: new Date(Date.now() + n).toISOString(),
    healthy: false,
    httpStatus: 503,
    latencyMs: 10,
    timedOut: false,
    failureReason: "health endpoint returned 503",
    failureCategory: "HTTP_5XX",
    resourceId: String(resource.id),
    providerStatus: "RUNNING",
  }));
  for (const observation of observations)
    await store!.recordObservation(observation);
  const incident: IncidentSnapshot = {
    id: crypto.randomUUID(),
    serviceId,
    deduplicationKey: `${serviceId}:health-check-unhealthy`,
    state: "DETECTED",
    severity: "HIGH",
    startedAt: observations[0]!.observedAt,
    resolvedAt: null,
    evidence: observations,
    recoveryEvidence: [],
  };
  await store!.createIncident(incident);
  const detectedAt = new Date(Date.now() + 100).toISOString();
  await store!.recordEvent({
    eventId: crypto.randomUUID(),
    eventType: "IncidentCreated",
    schemaVersion: 1,
    occurredAt: detectedAt,
    source: "incident-engine",
    serviceId,
    correlationId: incident.id,
    payload: {
      severity: incident.severity,
      deduplicationKey: incident.deduplicationKey,
      triggerObservationIds: observations.map((observation) => observation.id),
    },
  });
  return { incident, observations, detectedAt };
}

describe.skipIf(!databaseUrl)("diagnostic persistence", () => {
  it("persists a deterministic provider-aware diagnostic snapshot", async () => {
    const { incident, observations, detectedAt } = await fixture();
    const snapshot = await store!.createDiagnosticSnapshot(incident.id);
    expect(snapshot?.findings.map((f) => f.code)).toContain("SERVICE_HTTP_5XX");
    expect(snapshot?.contradictions[0]?.code).toBe(
      "RESOURCE_RUNNING_SERVICE_UNHEALTHY",
    );
    expect(snapshot?.rootCause.state).toBe("UNKNOWN");
    expect(snapshot?.temporal.thresholdCrossedAt).toBe(
      observations[2]!.observedAt,
    );
    expect(snapshot?.temporal.incidentDetectedAt).toBe(detectedAt);
    expect(snapshot?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("deduplicates equivalent snapshots and rejects update and delete", async () => {
    const { incident } = await fixture();
    const first = await store!.createDiagnosticSnapshot(incident.id);
    const second = await store!.createDiagnosticSnapshot(incident.id);
    expect(second?.snapshotId).toBe(first?.snapshotId);
    await expect(
      sql!`UPDATE diagnostic_snapshots SET content_hash=${"0".repeat(64)} WHERE id=${first!.snapshotId}`,
    ).rejects.toThrow(/immutable.*UPDATE/i);
    await expect(
      sql!`DELETE FROM diagnostic_snapshots WHERE id=${first!.snapshotId}`,
    ).rejects.toThrow(/immutable.*DELETE/i);
  });
  it("stored snapshot JSON alone reproduces its content_hash", async () => {
    const { incident } = await fixture();
    const created = await store!.createDiagnosticSnapshot(incident.id);
    const [row] =
      await sql!`SELECT content_hash,snapshot FROM diagnostic_snapshots WHERE id=${created!.snapshotId}`;
    // createdAt and contentHash are the only fields outside the hash.
    const omit = (o: object, keys: string[]) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    const stored = row!.snapshot as Record<string, unknown>;
    expect(deterministicHash(omit(stored, ["createdAt", "contentHash"]))).toBe(
      String(row!.content_hash),
    );
    expect(verifyDiagnosticSnapshot(created!)).toBe(true);
    expect(
      verifyDiagnosticSnapshot({
        ...(stored as object),
        incidentState: "RESOLVED",
      } as never),
    ).toBe(false);
    // The returned object is what was stored (plus its row id).
    expect(omit(created!, ["snapshotId"])).toEqual(stored);
  });
  it("rejects UPDATE, DELETE and TRUNCATE of snapshots", async () => {
    const { incident } = await fixture();
    const created = await store!.createDiagnosticSnapshot(incident.id);
    await expect(
      sql!`UPDATE diagnostic_snapshots SET snapshot='{}'::jsonb WHERE id=${created!.snapshotId}`,
    ).rejects.toThrow(/immutable.*UPDATE/i);
    await expect(
      sql!`DELETE FROM diagnostic_snapshots WHERE id=${created!.snapshotId}`,
    ).rejects.toThrow(/immutable.*DELETE/i);
    await expect(sql!`TRUNCATE diagnostic_snapshots`).rejects.toThrow(
      /immutable.*TRUNCATE/i,
    );
    // TRUNCATE of the parent cascades to snapshots and must be refused too.
    await expect(sql!`TRUNCATE incidents CASCADE`).rejects.toThrow(
      /immutable.*TRUNCATE/i,
    );
    const rows =
      await sql!`SELECT id FROM diagnostic_snapshots WHERE id=${created!.snapshotId}`;
    expect(rows).toHaveLength(1);
  });
  it("canonical hashing survives a JSONB round trip with fractional numbers", async () => {
    const value = {
      z: 0.1,
      a: { y: 1.5e-7, x: 123456.789, w: [0.30000000000000004, -0.5, 1e21] },
      m: null,
      b: true,
    };
    const [row] = await sql!`SELECT ${sql!.json(value)}::jsonb AS v`;
    expect(deterministicHash(row!.v)).toBe(deterministicHash(value));
  });
  const totals = async () =>
    (
      await sql!`SELECT
        (SELECT count(*) FROM diagnostic_snapshots)::int AS snapshots,
        (SELECT count(*) FROM domain_events)::int AS events,
        (SELECT count(*) FROM telemetry_observations)::int AS observations,
        (SELECT count(*) FROM incident_evidence)::int AS evidence,
        (SELECT count(*) FROM incidents)::int AS incidents`
    )[0]!;
  type SnapshotBody = {
    data: {
      snapshotId?: string;
      contentHash: string;
      rootCause: { state: string };
    };
  };
  it("GET /diagnosis computes the diagnosis with zero database writes", async () => {
    const { incident } = await fixture();
    const app = buildApi(store!, "test");
    const before = await totals();
    const first = await app.inject(`/incidents/${incident.id}/diagnosis`);
    const second = await app.inject(`/incidents/${incident.id}/diagnosis`);
    expect(first.statusCode).toBe(200);
    const body = first.json<SnapshotBody>();
    expect(body.data.rootCause.state).toBe("UNKNOWN");
    expect(body.data.snapshotId).toBeUndefined();
    expect(verifyDiagnosticSnapshot(body.data)).toBe(true);
    expect(second.json<SnapshotBody>().data.contentHash).toBe(
      body.data.contentHash,
    );
    expect(await totals()).toEqual(before);
    const list = await app.inject(`/incidents/${incident.id}/snapshots`);
    expect(list.json<{ data: unknown[] }>().data).toHaveLength(0);
    const missing = await app.inject(
      `/incidents/${crypto.randomUUID()}/diagnosis`,
    );
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
  it("POST /diagnosis/snapshots persists once: 201 then 200 with the same snapshot", async () => {
    const { incident } = await fixture();
    const app = buildApi(store!, "test");
    const url = `/incidents/${incident.id}/diagnosis/snapshots`;
    const created = await app.inject({ method: "POST", url });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json<SnapshotBody>();
    expect(createdBody.data.snapshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(verifyDiagnosticSnapshot(createdBody.data as never)).toBe(true);
    const again = await app.inject({ method: "POST", url });
    expect(again.statusCode).toBe(200);
    expect(again.json<SnapshotBody>().data.snapshotId).toBe(
      createdBody.data.snapshotId,
    );
    expect(
      (
        await sql!`SELECT count(*)::int n FROM diagnostic_snapshots WHERE incident_id=${incident.id}`
      )[0]!.n,
    ).toBe(1);
    // Existing read endpoints keep their contract.
    const list = await app.inject(`/incidents/${incident.id}/snapshots`);
    expect(list.statusCode).toBe(200);
    expect(list.json<{ data: unknown[] }>().data).toHaveLength(1);
    const detail = await app.inject(
      `/incidents/${incident.id}/snapshots/${createdBody.data.snapshotId}`,
    );
    expect(detail.statusCode).toBe(200);
    const unknown = await app.inject({
      method: "POST",
      url: `/incidents/${crypto.randomUUID()}/diagnosis/snapshots`,
    });
    expect(unknown.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "POST",
      url: "/incidents/not-a-uuid/diagnosis/snapshots",
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
  it("concurrent POSTs create exactly one snapshot", async () => {
    const { incident } = await fixture();
    const app = buildApi(store!, "test");
    const url = `/incidents/${incident.id}/diagnosis/snapshots`;
    const responses = await Promise.all(
      [0, 1, 2].map(() => app.inject({ method: "POST", url })),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
    expect(
      new Set(responses.map((r) => r.json<SnapshotBody>().data.snapshotId))
        .size,
    ).toBe(1);
    await app.close();
  });
});
