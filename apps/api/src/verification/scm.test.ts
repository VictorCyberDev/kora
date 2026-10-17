import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sha,
  startFakeServer,
  type FakeResponse,
  type RecordedRequest,
} from "../test-support/fake-servers.js";
import { observeCommitRelation, observeScmHead } from "./scm.js";

const TOKEN = "ghp_TESTTOKEN_do_not_leak_0123456789";
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  vi.restoreAllMocks();
});
async function github(handler: (r: RecordedRequest) => FakeResponse) {
  const server = await startFakeServer(handler);
  close = server.close;
  return server;
}
const refBody = (commit = sha(7)) => ({
  ref: "refs/heads/main",
  object: { sha: commit, type: "commit" },
});
const head = (
  apiUrl: string,
  over: Partial<{ token: string; branch: string }> = {},
) =>
  observeScmHead({
    apiUrl,
    repo: "acme/widgets",
    branch: over.branch ?? "main",
    ...(over.token ? { token: over.token } : {}),
    timeoutMs: 1000,
  });

describe("observeScmHead", () => {
  it("records the branch head sha, time and source URL", async () => {
    const server = await github(() => ({ body: refBody() }));
    const o = await head(server.url);
    expect(o).toMatchObject({
      kind: "scm_head",
      outcome: "OBSERVED",
      sha: sha(7),
      httpStatus: 200,
      reason: null,
      sourceUrl: `${server.url}/repos/acme/widgets/git/ref/heads/main`,
    });
    expect(new Date(o.observedAt).toISOString()).toBe(o.observedAt);
    expect(server.requests[0]!.headers["user-agent"]).toContain("kora");
    expect(server.requests[0]!.headers.accept).toContain(
      "application/vnd.github",
    );
  });
  it("encodes each segment of a branch name and keeps its slashes", async () => {
    const server = await github(() => ({ body: refBody() }));
    await head(server.url, { branch: "release/1.x" });
    expect(server.requests[0]!.url).toBe(
      "/repos/acme/widgets/git/ref/heads/release/1.x",
    );
  });
  it("sends the token only when one is configured", async () => {
    const server = await github(() => ({ body: refBody() }));
    await head(server.url);
    await head(server.url, { token: TOKEN });
    expect(server.requests[0]!.headers.authorization).toBeUndefined();
    expect(server.requests[1]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });
  it.each([
    [
      "404 not found",
      { status: 404, body: { message: "Not Found" } },
      "http_status_404",
    ],
    [
      "403 forbidden / rate limit",
      { status: 403, body: { message: "rate limit" } },
      "http_status_403",
    ],
    [
      "401 bad credentials",
      { status: 401, body: { message: "Bad credentials" } },
      "http_status_401",
    ],
    ["500 server error", { status: 500, body: {} }, "http_status_500"],
    [
      "a redirect",
      { status: 301, headers: { location: "http://127.0.0.1:1/x" } },
      "redirect_not_followed",
    ],
    ["non-JSON", { body: "<html>" }, "invalid_json"],
    [
      "a payload without a sha",
      { body: { ref: "refs/heads/main", object: {} } },
      "invalid_payload",
    ],
    ["a short sha", { body: refBody("abc123") }, "invalid_payload"],
    [
      "a non-commit object",
      { body: { object: { sha: sha(1), type: "tag" } } },
      "invalid_payload",
    ],
    ["an array payload", { body: [refBody()] }, "invalid_payload"],
  ] as Array<[string, FakeResponse, string]>)(
    "records UNKNOWN for %s",
    async (_name, reply, reason) => {
      const server = await github(() => reply);
      const o = await head(server.url, { token: TOKEN });
      expect(o).toMatchObject({ outcome: "UNKNOWN", sha: null, reason });
    },
  );
  it("records UNKNOWN for an unreachable host, a hang and a dropped socket", async () => {
    const dead = await startFakeServer(() => ({}));
    const url = dead.url;
    await dead.close();
    expect(await head(url)).toMatchObject({
      outcome: "UNKNOWN",
      reason: "unreachable: ECONNREFUSED",
    });
    const hang = await github(() => ({ hang: true }));
    expect(
      await observeScmHead({
        apiUrl: hang.url,
        repo: "a/b",
        branch: "main",
        timeoutMs: 150,
      }),
    ).toMatchObject({ outcome: "UNKNOWN", reason: "timeout" });
    await hang.close();
    const drop = await github(() => ({ drop: true }));
    expect((await head(drop.url)).outcome).toBe("UNKNOWN");
  });
  it("never lets the token reach an observation, even if the server echoes it", async () => {
    const outputs: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        outputs.push(args.map(String).join(" "));
      });
    const echo = (r: RecordedRequest): FakeResponse => ({
      status: 401,
      body: {
        message: `Bad credentials for ${r.headers.authorization}`,
        token: TOKEN,
      },
    });
    const server = await github(echo);
    const seen = [
      await head(server.url, { token: TOKEN }),
      await head("http://127.0.0.1:1", { token: TOKEN }),
      await head("not a url", { token: TOKEN }),
    ];
    expect(JSON.stringify(seen)).not.toContain(TOKEN);
    expect(outputs.join("\n")).not.toContain(TOKEN);
  });
  it("strips credentials from the recorded source URL", async () => {
    const server = await github(() => ({ body: refBody() }));
    const withUserinfo = server.url.replace("http://", "http://user:pw@");
    const o = await head(withUserinfo);
    expect(o.sourceUrl).not.toContain("user");
    expect(o.sourceUrl).not.toContain("pw@");
    expect(o.outcome).toBe("OBSERVED");
  });
});

describe("observeCommitRelation (GitHub compare API)", () => {
  const compare = (apiUrl: string, claimed = sha(1), headSha = sha(2)) =>
    observeCommitRelation({
      apiUrl,
      repo: "acme/widgets",
      claimedCommit: claimed,
      headSha,
      timeoutMs: 1000,
    });
  it("asks compare for claimed...head with a tiny page", async () => {
    const server = await github(() => ({
      body: { status: "identical", ahead_by: 0, behind_by: 0 },
    }));
    const o = await compare(server.url);
    expect(server.requests[0]!.url).toBe(
      `/repos/acme/widgets/compare/${sha(1)}...${sha(2)}?per_page=1`,
    );
    expect(o).toMatchObject({
      kind: "commit_relation",
      outcome: "OBSERVED",
      relation: "identical",
      behindBy: 0,
      aheadBy: 0,
    });
  });
  it("head ahead of the claimed commit means the claim is behind by N", async () => {
    const server = await github(() => ({
      body: { status: "ahead", ahead_by: 5, behind_by: 0 },
    }));
    expect(await compare(server.url)).toMatchObject({
      outcome: "OBSERVED",
      relation: "claimed_behind",
      behindBy: 5,
      aheadBy: 0,
    });
  });
  it("head behind the claimed commit means the claim is ahead", async () => {
    const server = await github(() => ({
      body: { status: "behind", ahead_by: 0, behind_by: 3 },
    }));
    expect(await compare(server.url)).toMatchObject({
      relation: "claimed_ahead",
      aheadBy: 3,
      behindBy: 0,
    });
  });
  it("records diverged", async () => {
    const server = await github(() => ({
      body: { status: "diverged", ahead_by: 2, behind_by: 4 },
    }));
    expect(await compare(server.url)).toMatchObject({
      relation: "diverged",
      behindBy: 2,
      aheadBy: 4,
    });
  });
  it.each([
    ["404 (commit unknown to GitHub)", { status: 404, body: {} }],
    ["500", { status: 500, body: {} }],
    ["non-JSON", { body: "x" }],
    [
      "an unknown status",
      { body: { status: "weird", ahead_by: 1, behind_by: 1 } },
    ],
    [
      "a non-numeric count",
      { body: { status: "ahead", ahead_by: "many", behind_by: 0 } },
    ],
    [
      "ahead with zero commits",
      { body: { status: "ahead", ahead_by: 0, behind_by: 0 } },
    ],
  ] as Array<[string, FakeResponse]>)(
    "records only 'differs' (UNKNOWN relation) for %s",
    async (_name, reply) => {
      const server = await github(() => reply);
      expect(await compare(server.url)).toMatchObject({
        outcome: "UNKNOWN",
        relation: null,
        behindBy: null,
        aheadBy: null,
      });
    },
  );
  it("does not throw when GitHub is unreachable", async () => {
    const dead = await startFakeServer(() => ({}));
    const url = dead.url;
    await dead.close();
    expect((await compare(url)).outcome).toBe("UNKNOWN");
  });
  it("sends the token only when configured and never records it", async () => {
    const server = await github(() => ({
      body: { status: "identical", ahead_by: 0, behind_by: 0 },
    }));
    const o = await observeCommitRelation({
      apiUrl: server.url,
      repo: "acme/widgets",
      claimedCommit: sha(1),
      headSha: sha(2),
      token: TOKEN,
      timeoutMs: 1000,
    });
    expect(server.requests[0]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(o)).not.toContain(TOKEN);
  });
});
