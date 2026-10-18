import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { buildApi } from "../app.js";
import { KoraStore } from "../store.js";
import {
  claimBody,
  sha,
  startFakeServer,
  type FakeResponse,
  type RecordedRequest,
} from "../test-support/fake-servers.js";
import { quietLogger } from "../test-support/monitor-harness.js";
import { DeploymentVerifier } from "./verifier.js";

const TOKEN = "ghp_TESTTOKEN_do_not_leak_0123456789";
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const store = sql ? new KoraStore(sql) : null;
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
afterAll(async () => {
  if (sql) await sql.end();
});

interface Scenario {
  head?: string;
  headReply?: (r: RecordedRequest) => FakeResponse;
  compare?: FakeResponse;
  workload?: FakeResponse | "down";
  token?: string;
}
async function verified(s: Scenario) {
  const github = await startFakeServer(
    s.headReply ??
      ((r) =>
        r.url.includes("/compare/")
          ? (s.compare ?? { status: 404, body: {} })
          : { body: { object: { sha: s.head ?? sha(1), type: "commit" } } }),
  );
  const workload = await startFakeServer(() =>
    s.workload && s.workload !== "down" ? s.workload : { body: claimBody() },
  );
  const claimUrl = `${workload.url}/__kora`;
  closers.push(github.close);
  if (s.workload === "down") await workload.close();
  else closers.push(workload.close);
  const service = await store!.ensureService(
    `api-${crypto.randomUUID()}`,
    `${workload.url}/health`,
  );
  const serviceId = String(service.id);
  await new DeploymentVerifier({
    store: store!,
    serviceId,
    logger: quietLogger,
    repo: "acme/widgets",
    branch: "main",
    apiUrl: github.url,
    claimUrl,
    timeoutMs: 1000,
    ...(s.token ? { token: s.token } : {}),
  }).checkOnce();
  return { serviceId };
}
type Report = {
  data: {
    method: string;
    status: string;
    behindBy: number | null;
    relation: string | null;
    scmHead: string | null;
    claimedCommit: string | null;
    detail: string;
    providerLeg: { status: string; reason: string };
    evidence: Array<{
      kind: string;
      observationId: string;
      used: boolean;
      outcome: string;
      reason: string | null;
    }>;
    checkId: string;
  };
};
async function report(serviceId: string) {
  const app = buildApi(store!, "test");
  const r = await app.inject(`/services/${serviceId}/verification`);
  await app.close();
  return { statusCode: r.statusCode, body: r.json<Report>(), text: r.body };
}

describe.skipIf(!databaseUrl)("GET /services/:id/verification", () => {
  it("MATCH: claimed commit equals the source head", async () => {
    const { serviceId } = await verified({ head: sha(1) });
    const { statusCode, body } = await report(serviceId);
    expect(statusCode).toBe(200);
    expect(body.data).toMatchObject({
      method: "Deployment Verification (not cryptographic)",
      status: "MATCH",
      scmHead: sha(1),
      claimedCommit: sha(1),
    });
  });
  it("BEHIND N: the claim is N commits behind the head", async () => {
    const { serviceId } = await verified({
      head: sha(2),
      compare: { body: { status: "ahead", ahead_by: 3, behind_by: 0 } },
    });
    const { body } = await report(serviceId);
    expect(body.data).toMatchObject({
      status: "BEHIND",
      behindBy: 3,
      relation: "claimed_behind",
    });
    expect(body.data.detail).toContain("3 commits");
  });
  it("DIVERGED, with the relation when compare answered", async () => {
    const { serviceId } = await verified({
      head: sha(2),
      compare: { body: { status: "diverged", ahead_by: 1, behind_by: 1 } },
    });
    expect((await report(serviceId)).body.data).toMatchObject({
      status: "DIVERGED",
      relation: "diverged",
    });
  });
  it("DIVERGED as 'differs' when the compare call failed", async () => {
    const { serviceId } = await verified({
      head: sha(2),
      compare: { status: 500, body: {} },
    });
    const { body } = await report(serviceId);
    expect(body.data).toMatchObject({
      status: "DIVERGED",
      relation: "differs",
      behindBy: null,
    });
    expect(
      body.data.evidence.find((e) => e.kind === "commit_relation"),
    ).toMatchObject({
      outcome: "UNKNOWN",
      used: false,
    });
  });
  it("CLAIM_HAS_NO_COMMIT", async () => {
    const { serviceId } = await verified({
      workload: {
        body: claimBody({
          commit: null,
          commitSource: "unavailable",
          builtAt: null,
        }),
      },
    });
    const { body } = await report(serviceId);
    expect(body.data).toMatchObject({
      status: "CLAIM_HAS_NO_COMMIT",
      claimedCommit: null,
      scmHead: sha(1),
    });
  });
  it("CLAIM_UNREACHABLE: the workload is down", async () => {
    const { serviceId } = await verified({ workload: "down" });
    const { body } = await report(serviceId);
    expect(body.data.status).toBe("CLAIM_UNREACHABLE");
    expect(
      body.data.evidence.find((e) => e.kind === "workload_claim"),
    ).toMatchObject({
      outcome: "UNKNOWN",
      reason: "unreachable: ECONNREFUSED",
    });
  });
  it("CLAIM_UNREACHABLE: the claim does not validate", async () => {
    const { serviceId } = await verified({
      workload: { body: claimBody({ schema: "kora.runtime-claim/v9" }) },
    });
    expect((await report(serviceId)).body.data.status).toBe(
      "CLAIM_UNREACHABLE",
    );
  });
  it("SCM_UNKNOWN: GitHub refused", async () => {
    const { serviceId } = await verified({
      headReply: () => ({ status: 403, body: { message: "rate limit" } }),
    });
    const { body } = await report(serviceId);
    expect(body.data).toMatchObject({
      status: "SCM_UNKNOWN",
      scmHead: null,
      claimedCommit: sha(1),
    });
  });
  it("lists the evidence each status used by observation id", async () => {
    const { serviceId } = await verified({
      head: sha(2),
      compare: { body: { status: "ahead", ahead_by: 2, behind_by: 0 } },
    });
    const { body } = await report(serviceId);
    expect(body.data.evidence.map((e) => [e.kind, e.used])).toEqual(
      [
        ["scm_head", true],
        ["workload_claim", true],
        ["commit_relation", true],
      ].sort(),
    );
    const stored =
      await sql!`SELECT id FROM verification_observations WHERE check_id=${body.data.checkId}`;
    expect(new Set(body.data.evidence.map((e) => e.observationId))).toEqual(
      new Set(stored.map((r) => String(r.id))),
    );
  });
  it("always reports the provider leg as NOT COLLECTED", async () => {
    for (const s of [{ head: sha(1) }, { workload: "down" as const }])
      expect(
        (await report((await verified(s)).serviceId)).body.data.providerLeg,
      ).toEqual({
        status: "NOT COLLECTED",
        reason: "Rumpty exposes no documented deployment revision signal",
      });
  });
  it("never contains the token, even when GitHub echoes it, and avoids overclaiming words", async () => {
    const { serviceId } = await verified({
      token: TOKEN,
      headReply: (r) => ({
        status: 401,
        body: {
          message: `Bad credentials ${r.headers.authorization ?? ""}`,
          token: TOKEN,
        },
      }),
    });
    const { text } = await report(serviceId);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toMatch(/attested|proven|secure/i);
  });
  it("is read-only: a GET writes nothing", async () => {
    const { serviceId } = await verified({});
    const count = async () =>
      Number(
        (await sql!`SELECT count(*)::int n FROM verification_observations`)[0]!
          .n,
      );
    const before = await count();
    await report(serviceId);
    await report(serviceId);
    expect(await count()).toBe(before);
  });
  it("uses the latest check", async () => {
    const first = await verified({ head: sha(1) });
    expect((await report(first.serviceId)).body.data.status).toBe("MATCH");
  });
  it("404s for an unknown service, 400 for a bad id, and says when no check has run", async () => {
    const app = buildApi(store!, "test");
    expect(
      (await app.inject(`/services/${crypto.randomUUID()}/verification`))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject("/services/not-a-uuid/verification")).statusCode,
    ).toBe(400);
    const s = await store!.ensureService(
      `never-${crypto.randomUUID()}`,
      "http://x.test/health",
    );
    const r = await app.inject(`/services/${String(s.id)}/verification`);
    expect(r.statusCode).toBe(404);
    expect(r.json<{ error: string }>().error).toBe("verification_not_run");
    await app.close();
  });
});
