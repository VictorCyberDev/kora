import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import type {
  IncidentSnapshot,
  TelemetryObservation,
} from "@kora/incident-engine";
import { KoraStore } from "./store.js";
import { buildApi } from "./app.js";
import { deterministicHash } from "./diagnosis.js";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 2 }) : null;
const store = sql ? new KoraStore(sql) : null;
afterAll(async () => {
  if (sql) await sql.end();
});
afterEach(() => vi.useRealTimers());

const cli = fileURLToPath(
  new URL("../../../packages/passport/dist/cli.js", import.meta.url),
);

// Claims the Passport must never make (built from fragments so the phrases
// do not appear in the repository as text).
const forbiddenClaims = new RegExp(
  [
    ["tamper", "[- ]?", "proof"],
    ["at", "tested"],
    ["verified", " ", "deployment"],
  ]
    .map((parts) => parts.join(""))
    .join("|"),
  "i",
);

type Json = Record<string, unknown>;

async function fixture(options: { resolved?: boolean } = {}) {
  const service = await store!.ensureService(
    `passport-${crypto.randomUUID()}`,
    "http://example.invalid/health",
  );
  const serviceId = String(service.id);
  const resource = await store!.ensureProviderResource({
    provider: "rumptycloud",
    providerAccount: `workspace-${crypto.randomUUID()}`,
    region: "verified-test-region",
    resourceType: "virtual_machine",
    providerResourceId: `rc-${crypto.randomUUID()}`,
    displayName: "passport-test",
    environment: "test",
    status: "RUNNING",
    metadata: {},
  });
  await store!.bindServiceToResource(serviceId, String(resource.id));
  const base = Date.now() - 60_000;
  const observation = (
    n: number,
    healthy: boolean,
    reason: string | null,
  ): TelemetryObservation => ({
    id: crypto.randomUUID(),
    serviceId,
    observedAt: new Date(base + n * 1000).toISOString(),
    healthy,
    httpStatus: healthy ? 200 : 503,
    latencyMs: 10 + n,
    timedOut: false,
    failureReason: reason,
    failureCategory: healthy ? null : "HTTP_5XX",
    resourceId: String(resource.id),
    providerStatus: "RUNNING",
  });
  const failing = [
    observation(0, false, "health endpoint returned 503"),
    observation(1, false, "upstream token=hunter2 rejected"),
    observation(2, false, "health endpoint returned 503"),
  ];
  const recovery = [observation(5, true, null), observation(6, true, null)];
  for (const o of [...failing, ...recovery]) await store!.recordObservation(o);
  const incident: IncidentSnapshot = {
    id: crypto.randomUUID(),
    serviceId,
    deduplicationKey: `${serviceId}:health-check-unhealthy`,
    state: "DETECTED",
    severity: "HIGH",
    startedAt: failing[0]!.observedAt,
    resolvedAt: null,
    evidence: failing,
    recoveryEvidence: [],
  };
  await store!.createIncident(incident);
  await store!.recordEvent({
    eventId: crypto.randomUUID(),
    eventType: "IncidentCreated",
    schemaVersion: 1,
    occurredAt: new Date(base + 3000).toISOString(),
    source: "incident-engine",
    serviceId,
    correlationId: incident.id,
    payload: {
      severity: "HIGH",
      // Fractional numbers must survive JSONB and still hash identically.
      ratio: 0.1,
      sumOfRatios: 0.30000000000000004,
      latencySeconds: 12.345678901234567,
      tiny: 1e-7,
    },
  });
  if (options.resolved) {
    const resolved = {
      ...incident,
      state: "RESOLVED" as const,
      resolvedAt: recovery[1]!.observedAt,
      recoveryEvidence: recovery,
    };
    await store!.resolveIncident(resolved);
    await store!.recordEvent({
      eventId: crypto.randomUUID(),
      eventType: "RecoveryVerified",
      schemaVersion: 1,
      occurredAt: recovery[1]!.observedAt,
      source: "incident-engine",
      serviceId,
      correlationId: incident.id,
      payload: { verifiedBy: "consecutive healthy checks" },
    });
  }
  return { incident, serviceId };
}

async function exportPassport(id: string) {
  const app = buildApi(store!, "test");
  const r = await app.inject(`/incidents/${id}/passport`);
  await app.close();
  return r;
}
function verifyWithCli(text: string) {
  expect(
    existsSync(cli),
    `${cli} missing: run "pnpm build" before the API tests`,
  ).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "kora-passport-"));
  const file = join(dir, "passport.json");
  writeFileSync(file, text);
  const r = spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe.skipIf(!databaseUrl)("GET /incidents/:id/passport", () => {
  it("exports the documented structure", async () => {
    const { incident, serviceId } = await fixture();
    const r = await exportPassport(incident.id);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/application\/json/);
    expect(r.headers["cache-control"]).toBe("no-store");
    const p = r.json<Json>();
    expect(Object.keys(p).sort()).toEqual([
      "diagnosis",
      "evidence",
      "gaps",
      "generatedAt",
      "incident",
      "integrity",
      "resource",
      "schema",
      "service",
      "timeline",
    ]);
    expect(p.schema).toBe("kora.incident-passport/v1");
    expect(p.incident).toMatchObject({
      id: incident.id,
      serviceId,
      state: "DETECTED",
      severity: "HIGH",
      resolvedAt: null,
    });
    expect(p.service).toMatchObject({ id: serviceId });
    expect(p.resource).toMatchObject({
      provider: "rumptycloud",
      status: "RUNNING",
    });
    const evidence = p.evidence as Json[];
    expect(evidence).toHaveLength(3);
    for (const e of evidence) {
      expect(e.contentHash).toMatch(/^[0-9a-f]{64}$/);
      const { contentHash, ...rest } = e;
      expect(deterministicHash(rest)).toBe(contentHash);
    }
    expect(p.integrity).toEqual({
      algorithm: "sha256",
      canonicalization: "kora-stable-json/v1",
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
    });
    expect(Number.isNaN(Date.parse(p.generatedAt as string))).toBe(false);
    expect((p.diagnosis as Json).contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((p.timeline as Json[]).map((t) => t.eventType)).toContain(
      "IncidentCreated",
    );
  });

  it("lists every UNKNOWN or NOT COLLECTED item with a reason", async () => {
    const { incident } = await fixture();
    const p = (await exportPassport(incident.id)).json<Json>();
    const gaps = p.gaps as Array<{
      item: string;
      status: string;
      reason: string;
    }>;
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(["UNKNOWN", "NOT COLLECTED"]).toContain(g.status);
      expect(g.reason.trim().length).toBeGreaterThan(10);
    }
    const byItem = new Map(gaps.map((g) => [g.item, g]));
    expect(byItem.get("rootCause")?.status).toBe("UNKNOWN");
    expect(byItem.get("applicationLogs")?.status).toBe("NOT COLLECTED");
    expect(byItem.get("resourceMetrics")?.status).toBe("NOT COLLECTED");
    expect(byItem.get("deploymentContext")?.status).toBe("NOT COLLECTED");
    expect(byItem.get("producer")?.status).toBe("UNKNOWN");
    expect(byItem.get("producer")?.reason).toMatch(/not signed/i);
    expect(new Set(gaps.map((g) => g.item)).size).toBe(gaps.length);
  });

  it("a Passport from a real incident verifies offline", async () => {
    const { incident } = await fixture();
    const r = await exportPassport(incident.id);
    const v = verifyWithCli(r.body);
    expect(v.out).toMatch(/^PASS /);
    expect(v.code).toBe(0);
  });

  it("a resolved incident with recovery evidence also verifies", async () => {
    const { incident } = await fixture({ resolved: true });
    const r = await exportPassport(incident.id);
    const p = r.json<Json>();
    expect((p.incident as Json).state).toBe("RESOLVED");
    expect((p.evidence as Json[]).map((e) => e.kind)).toContain("recovery");
    const v = verifyWithCli(r.body);
    expect(v.code).toBe(0);
  });

  it("changing a value in evidence, diagnosis, gaps or the hash makes the CLI FAIL", async () => {
    const { incident } = await fixture();
    const text = (await exportPassport(incident.id)).body;
    const edits: Array<[string, (p: Json) => void]> = [
      ["evidence", (p) => ((p.evidence as Json[])[0]!.httpStatus = 200)],
      ["diagnosis", (p) => ((p.diagnosis as Json).incidentState = "RESOLVED")],
      ["gaps", (p) => ((p.gaps as Json[])[0]!.reason = "all good")],
      [
        "hash",
        (p) => {
          const i = p.integrity as Json;
          const h = i.contentHash as string;
          i.contentHash = (h[0] === "0" ? "1" : "0") + h.slice(1);
        },
      ],
    ];
    for (const [name, edit] of edits) {
      const p = JSON.parse(text) as Json;
      edit(p);
      const v = verifyWithCli(JSON.stringify(p));
      expect(v.out, name).toMatch(/^FAIL /);
      expect(v.code, name).toBe(1);
    }
  });

  it("changing any single character of the file fails, except inside generatedAt", async () => {
    const { incident } = await fixture();
    const text = (await exportPassport(incident.id)).body;
    expect(text.length).toBeGreaterThan(1000);
    const stamp = text.indexOf('"generatedAt":"') + '"generatedAt":"'.length;
    const generatedAt = { from: stamp, to: stamp + 24 };
    const { verifyPassport } = (await import(
      pathToFileURL(
        fileURLToPath(
          new URL("../../../packages/passport/dist/index.js", import.meta.url),
        ),
      ).href
    )) as { verifyPassport: (input: unknown) => { ok: boolean } };
    const survivors: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (i >= generatedAt.from && i < generatedAt.to) continue;
      const mutated =
        text.slice(0, i) + (text[i] === "x" ? "y" : "x") + text.slice(i + 1);
      let ok = false;
      try {
        ok = verifyPassport(JSON.parse(mutated)).ok;
      } catch {
        ok = false; // not even JSON
      }
      if (ok) survivors.push(i);
    }
    expect(survivors).toEqual([]);
  }, 60_000);

  it("is identical on repeated calls except generatedAt", async () => {
    const { incident } = await fixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
    const a = (await exportPassport(incident.id)).json<Json>();
    vi.setSystemTime(new Date("2031-06-01T12:00:00.000Z"));
    const b = (await exportPassport(incident.id)).json<Json>();
    expect(a.generatedAt).toBe("2031-01-01T00:00:00.000Z");
    expect(b.generatedAt).toBe("2031-06-01T12:00:00.000Z");
    const strip = ({ generatedAt, ...rest }: Json) => {
      void generatedAt;
      return rest;
    };
    expect(strip(b)).toEqual(strip(a));
    expect((b.integrity as Json).contentHash).toBe(
      (a.integrity as Json).contentHash,
    );
    // And byte-identical once generatedAt is blanked.
    vi.useRealTimers();
    const t1 = (await exportPassport(incident.id)).body;
    const t2 = (await exportPassport(incident.id)).body;
    const blank = (t: string) =>
      t.replace(/"generatedAt":"[^"]*"/, '"generatedAt":""');
    expect(blank(t2)).toBe(blank(t1));
  });

  it("writes nothing", async () => {
    const { incident } = await fixture();
    const tables = (
      await sql!`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`
    ).map((t) => String(t.tablename));
    const counts = async () => {
      const out: Record<string, number> = {};
      for (const t of tables)
        out[t] = Number(
          (await sql!.unsafe(`SELECT count(*)::int AS n FROM "${t}"`))[0]!.n,
        );
      return out;
    };
    expect(tables).toContain("diagnostic_snapshots");
    const before = await counts();
    const r = await exportPassport(incident.id);
    expect(r.statusCode).toBe(200);
    expect(await counts()).toEqual(before);
  });

  it("hash is stable across a PostgreSQL JSONB round trip with fractional numbers", async () => {
    const { incident } = await fixture();
    const r = await exportPassport(incident.id);
    const original = r.json<Json>();
    const payload = (original.timeline as Json[]).find(
      (t) => t.eventType === "IncidentCreated",
    )!.payload as Json;
    expect(payload).toMatchObject({
      ratio: 0.1,
      sumOfRatios: 0.30000000000000004,
      latencySeconds: 12.345678901234567,
      tiny: 1e-7,
    });
    const [row] = await sql!`
      SELECT ${sql!.json(original as unknown as postgres.JSONValue)}::jsonb AS doc`;
    const roundTripped = row!.doc as Json;
    expect(roundTripped).toEqual(original);
    expect(deterministicHash(roundTripped)).toBe(deterministicHash(original));
    // The round-tripped document still verifies offline.
    expect(verifyWithCli(JSON.stringify(roundTripped)).code).toBe(0);
    // Whole-database path: store the document, read it back, re-verify.
    const [stored] = await sql!`
      SELECT to_jsonb(${sql!.json(original as unknown as postgres.JSONValue)}::jsonb) AS doc`;
    expect(verifyWithCli(JSON.stringify(stored!.doc)).code).toBe(0);
  });

  it("redacts secret-looking text before it leaves the API", async () => {
    const { incident } = await fixture();
    const r = await exportPassport(incident.id);
    expect(r.body).not.toContain("hunter2");
    const reasons = (r.json<Json>().evidence as Json[]).map(
      (e) => e.failureReason,
    );
    expect(reasons).toContain("[REDACTED]");
  });

  it("never claims more than integrity", async () => {
    const { incident } = await fixture();
    const r = await exportPassport(incident.id);
    expect(r.body).not.toMatch(forbiddenClaims);
  });

  it("404s for an unknown incident and 400s for an invalid id", async () => {
    const app = buildApi(store!, "test");
    const missing = await app.inject(
      `/incidents/${crypto.randomUUID()}/passport`,
    );
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject("/incidents/nope/passport");
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});
