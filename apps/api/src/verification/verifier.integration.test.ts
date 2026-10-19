import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { applyMigrations } from "../db/apply-migrations.js";
import { KoraStore } from "../store.js";
import {
  claimBody,
  sha,
  startFakeServer,
  type FakeResponse,
  type RecordedRequest,
} from "../test-support/fake-servers.js";
import { quietLogger } from "../test-support/monitor-harness.js";
import { loadConfig } from "../config.js";
import { buildVerificationReport } from "./report.js";
import { DeploymentVerifier, verifierFromConfig } from "./verifier.js";

const TOKEN = "ghp_TESTTOKEN_do_not_leak_0123456789";
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closers.splice(0)) await close();
});
afterAll(async () => {
  if (sql) await sql.end();
});

interface Scenario {
  scm?: (r: RecordedRequest) => FakeResponse;
  workload?: FakeResponse;
  token?: string;
}
async function setup(s: Scenario = {}) {
  const github = await startFakeServer(
    s.scm ??
      ((r) =>
        r.url.includes("/compare/")
          ? { body: { status: "ahead", ahead_by: 3, behind_by: 0 } }
          : { body: { object: { sha: sha(2), type: "commit" } } }),
  );
  const workload = await startFakeServer(
    () => s.workload ?? { body: claimBody() },
  );
  closers.push(github.close, workload.close);
  const service = await store!.ensureService(
    `verify-${crypto.randomUUID()}`,
    `${workload.url}/health`,
  );
  const serviceId = String(service.id);
  const verifier = new DeploymentVerifier({
    store: store!,
    serviceId,
    logger: quietLogger,
    repo: "acme/widgets",
    branch: "main",
    apiUrl: github.url,
    claimUrl: `${workload.url}/__kora`,
    timeoutMs: 1000,
    ...(s.token ? { token: s.token } : {}),
  });
  return { verifier, serviceId, github, workload };
}
type Row = Record<string, unknown>;
const rows = async (serviceId: string) =>
  (await sql!`SELECT * FROM verification_observations WHERE service_id=${serviceId} ORDER BY kind`) as unknown as Row[];

describe.skipIf(!databaseUrl)("migration 005", () => {
  it("is re-runnable and creates the append-only observation table", async () => {
    await applyMigrations(sql!);
    await applyMigrations(sql!);
    const [t] =
      await sql!`SELECT to_regclass('verification_observations') AS t`;
    expect(t!.t).not.toBeNull();
  });
  it("keeps unknown as NULL and rejects inconsistent rows", async () => {
    const { serviceId } = await setup();
    const insert = (over: Record<string, unknown>) =>
      sql!`INSERT INTO verification_observations ${sql!({
        id: crypto.randomUUID(),
        check_id: crypto.randomUUID(),
        service_id: serviceId,
        kind: "scm_head",
        outcome: "UNKNOWN",
        observed_at: new Date().toISOString(),
        source_url: "http://x/y",
        reason: "timeout",
        ...over,
      } as never)}`;
    await expect(insert({})).resolves.toBeDefined();
    await expect(insert({ commit_sha: sha(1) })).rejects.toThrow(); // UNKNOWN with a sha
    await expect(
      insert({ outcome: "OBSERVED", reason: null }),
    ).rejects.toThrow(); // OBSERVED scm without sha
    await expect(
      insert({ outcome: "OBSERVED", reason: null, commit_sha: "XYZ" }),
    ).rejects.toThrow();
    await expect(insert({ kind: "nonsense" })).rejects.toThrow();
    await expect(
      insert({ outcome: "UNKNOWN", reason: null }),
    ).rejects.toThrow(); // unknown needs a reason
    await expect(insert({ relation: "diverged" })).rejects.toThrow(); // relation only on commit_relation
  });
});

describe.skipIf(!databaseUrl)("DeploymentVerifier.checkOnce", () => {
  it("persists one check atomically: head, claim and (when they differ) relation", async () => {
    const { verifier, serviceId, github } = await setup();
    await verifier.checkOnce();
    const r = await rows(serviceId);
    expect(r.map((x) => x.kind)).toEqual([
      "commit_relation",
      "scm_head",
      "workload_claim",
    ]);
    expect(new Set(r.map((x) => x.check_id)).size).toBe(1);
    const by = Object.fromEntries(r.map((x) => [String(x.kind), x])) as Record<
      string,
      Row
    >;
    expect(by.scm_head).toMatchObject({
      outcome: "OBSERVED",
      commit_sha: sha(2),
      reason: null,
    });
    expect(by.scm_head!.source_url).toBe(
      `${github.url}/repos/acme/widgets/git/ref/heads/main`,
    );
    expect(by.workload_claim).toMatchObject({
      outcome: "OBSERVED",
      commit_sha: sha(1),
      commit_source: "build-info",
      claim_service: "demo-service",
      claim_environment: "test",
    });
    expect(by.commit_relation).toMatchObject({
      outcome: "OBSERVED",
      relation: "claimed_behind",
      behind_by: 3,
      ahead_by: 0,
    });
  });
  it("asks compare only when both commits exist and differ", async () => {
    const same = await setup({
      scm: () => ({ body: { object: { sha: sha(1), type: "commit" } } }),
    });
    await same.verifier.checkOnce();
    expect(same.github.requests.some((q) => q.url.includes("/compare/"))).toBe(
      false,
    );
    expect((await rows(same.serviceId)).map((x) => x.kind)).toEqual([
      "scm_head",
      "workload_claim",
    ]);
    const noCommit = await setup({
      workload: {
        body: claimBody({
          commit: null,
          commitSource: "unavailable",
          builtAt: null,
        }),
      },
    });
    await noCommit.verifier.checkOnce();
    expect(
      noCommit.github.requests.some((q) => q.url.includes("/compare/")),
    ).toBe(false);
  });
  it("stores unknown observations with NULL columns and a reason, and never throws", async () => {
    const { verifier, serviceId } = await setup({
      scm: () => ({ status: 403, body: { message: "rate limited" } }),
      workload: { status: 500 },
    });
    await expect(verifier.checkOnce()).resolves.toBeUndefined();
    const r = await rows(serviceId);
    expect(r.map((x) => [x.kind, x.outcome, x.reason])).toEqual([
      ["scm_head", "UNKNOWN", "http_status_403"],
      ["workload_claim", "UNKNOWN", "http_status_500"],
    ]);
    for (const x of r)
      for (const col of [
        "commit_sha",
        "commit_source",
        "built_at",
        "claim_service",
        "claim_environment",
        "claim_started_at",
        "relation",
        "behind_by",
        "ahead_by",
      ])
        expect(x[col], col).toBeNull();
  });
  it("records a claim with no commit as an OBSERVED claim with NULL commit", async () => {
    const { verifier, serviceId } = await setup({
      workload: {
        body: claimBody({
          commit: null,
          commitSource: "unavailable",
          builtAt: null,
        }),
      },
    });
    await verifier.checkOnce();
    const claim = (await rows(serviceId)).find(
      (x) => x.kind === "workload_claim",
    )!;
    expect(claim).toMatchObject({
      outcome: "OBSERVED",
      commit_sha: null,
      commit_source: "unavailable",
      built_at: null,
      reason: null,
    });
  });
  it("is atomic: a failure while writing leaves nothing from that check", async () => {
    const { verifier, serviceId } = await setup();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = KoraStore.prototype.insertVerificationObservation;
    let calls = 0;
    vi.spyOn(
      KoraStore.prototype,
      "insertVerificationObservation",
    ).mockImplementation(function (this: KoraStore, ...args) {
      if (++calls === 2) return Promise.reject(new Error("injected fault"));
      return original.apply(this, args);
    });
    await expect(verifier.checkOnce()).rejects.toThrow("injected fault");
    expect(await rows(serviceId)).toHaveLength(0);
    vi.restoreAllMocks();
    await verifier.checkOnce();
    expect(await rows(serviceId)).toHaveLength(3);
  });
  it("sends the token to GitHub only, and it appears in no row and no log", async () => {
    const logs: string[] = [];
    for (const m of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(" "));
      });
    const { verifier, serviceId, github, workload } = await setup({
      token: TOKEN,
      scm: (r) => ({
        status: 200,
        body: {
          object: { sha: sha(2), type: "commit" },
          echo: r.headers.authorization,
        },
      }),
    });
    await verifier.checkOnce();
    expect(
      github.requests.every(
        (q) => q.headers.authorization === `Bearer ${TOKEN}`,
      ),
    ).toBe(true);
    expect(
      workload.requests.every((q) => q.headers.authorization === undefined),
    ).toBe(true);
    expect(JSON.stringify(await rows(serviceId))).not.toContain(TOKEN);
    expect(JSON.stringify(verifier)).not.toContain(TOKEN);
    expect(logs.join("\n")).not.toContain(TOKEN);
  });
});

describe.skipIf(!databaseUrl)("verifierFromConfig", () => {
  const env = {
    DATABASE_URL: "postgresql://u:p@localhost/db_test",
    MONITOR_ENABLED: "false",
  };
  it("is disabled without GITHUB_REPO", async () => {
    const service = await store!.ensureService(
      `cfg-${crypto.randomUUID()}`,
      "http://x.test/health",
    );
    expect(
      verifierFromConfig(
        loadConfig(env),
        store!,
        String(service.id),
        quietLogger,
      ),
    ).toBeNull();
  });
  it("wires repo, branch, API URL, claim URL and the token from config", async () => {
    const github = await startFakeServer(() => ({
      body: { object: { sha: sha(1), type: "commit" } },
    }));
    const workload = await startFakeServer(() => ({ body: claimBody() }));
    closers.push(github.close, workload.close);
    const service = await store!.ensureService(
      `cfg-${crypto.randomUUID()}`,
      `${workload.url}/health`,
    );
    const config = loadConfig({
      ...env,
      MONITOR_HEALTH_URL: `${workload.url}/health`,
      GITHUB_REPO: "acme/widgets",
      GITHUB_BRANCH: "trunk",
      GITHUB_API_URL: github.url,
      GITHUB_TOKEN: TOKEN,
    });
    const verifier = verifierFromConfig(
      config,
      store!,
      String(service.id),
      quietLogger,
    );
    expect(verifier).not.toBeNull();
    await verifier!.checkOnce();
    expect(github.requests[0]!.url).toBe(
      "/repos/acme/widgets/git/ref/heads/trunk",
    );
    expect(github.requests[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(workload.requests[0]!.url).toBe("/__kora"); // default: health origin + /__kora
    expect(JSON.stringify(verifier)).not.toContain(TOKEN);
  });
});

const rateLimited = (): FakeResponse => ({
  status: 403,
  headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1999999999" },
  body: { message: `API rate limit exceeded; token ${TOKEN}` },
});

describe.skipIf(!databaseUrl)("rate limiting and conditional requests", () => {
  it("records rate_limited, makes exactly one GitHub call and reports it honestly", async () => {
    const { verifier, serviceId, github } = await setup({
      scm: rateLimited,
      token: TOKEN,
    });
    await verifier.checkOnce();
    expect(github.requests).toHaveLength(1); // no retry, no compare
    const r = await rows(serviceId);
    expect(r.map((x) => [x.kind, x.outcome, x.reason, x.http_status])).toEqual([
      ["scm_head", "UNKNOWN", "rate_limited", 403],
      ["workload_claim", "OBSERVED", null, 200],
    ]);
    const latest = await store!.getLatestVerification(serviceId);
    const report = buildVerificationReport(serviceId, latest!);
    expect(report.status).toBe("SCM_UNKNOWN");
    expect(report.detail).toMatch(/rate limited/i);
    expect(report.detail).toContain("GITHUB_TOKEN");
    const text = JSON.stringify([r, report]);
    for (const leaked of [TOKEN, "1999999999", "exceeded"])
      expect(text).not.toContain(leaked);
  });
  it("makes exactly one GitHub call per interval while rate limited", async () => {
    const { serviceId, github, workload } = await setup({ scm: rateLimited });
    const intervalMs = 150;
    const limited = new DeploymentVerifier({
      store: store!,
      serviceId,
      logger: quietLogger,
      repo: "acme/widgets",
      branch: "main",
      apiUrl: github.url,
      claimUrl: `${workload.url}/__kora`,
      timeoutMs: 1000,
      intervalMs,
    });
    limited.start();
    await new Promise((resolve) => setTimeout(resolve, intervalMs * 3.5));
    await limited.stop();
    const checks = new Set(
      (await rows(serviceId)).map((x) => String(x.check_id)),
    );
    expect(checks.size).toBeGreaterThanOrEqual(3);
    expect(
      github.requests.filter((q) => q.url.includes("/git/ref/")),
    ).toHaveLength(checks.size);
    expect(github.requests).toHaveLength(checks.size);
  });
  it("sends If-None-Match and reuses the OBSERVED head and relation on 304", async () => {
    const { verifier, serviceId, github } = await setup({
      scm: (r) => {
        const tag = r.url.includes("/compare/") ? '"cmp1"' : '"head1"';
        if (r.headers["if-none-match"] === tag)
          return { status: 304, body: "" };
        return r.url.includes("/compare/")
          ? {
              body: { status: "ahead", ahead_by: 3, behind_by: 0 },
              headers: { etag: tag },
            }
          : {
              body: { object: { sha: sha(2), type: "commit" } },
              headers: { etag: tag },
            };
      },
    });
    await verifier.checkOnce();
    await verifier.checkOnce();
    expect(github.requests.map((q) => q.headers["if-none-match"])).toEqual([
      undefined,
      undefined,
      '"head1"',
      '"cmp1"',
    ]);
    const latest = await store!.getLatestVerification(serviceId);
    const report = buildVerificationReport(serviceId, latest!);
    expect(report).toMatchObject({
      status: "BEHIND",
      behindBy: 3,
      scmHead: sha(2),
    });
    const second = (await rows(serviceId)).filter(
      (x) => x.check_id === latest!.checkId,
    );
    expect(
      second.map((x) => [x.kind, x.outcome, x.http_status, x.commit_sha]),
    ).toEqual([
      ["commit_relation", "OBSERVED", 304, null],
      ["scm_head", "OBSERVED", 304, sha(2)],
      ["workload_claim", "OBSERVED", 200, sha(1)],
    ]);
  });
  it("a new verifier (a restart) starts with an empty cache", async () => {
    const { verifier, serviceId, github, workload } = await setup({
      scm: () => ({
        body: { object: { sha: sha(1), type: "commit" } },
        headers: { etag: '"head1"' },
      }),
    });
    await verifier.checkOnce();
    const restarted = new DeploymentVerifier({
      store: store!,
      serviceId,
      logger: quietLogger,
      repo: "acme/widgets",
      branch: "main",
      apiUrl: github.url,
      claimUrl: `${workload.url}/__kora`,
      timeoutMs: 1000,
    });
    await restarted.checkOnce();
    expect(github.requests.map((q) => q.headers["if-none-match"])).toEqual([
      undefined,
      undefined,
    ]);
  });
});
