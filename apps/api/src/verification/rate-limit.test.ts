import { afterEach, describe, expect, it } from "vitest";
import {
  sha,
  startFakeServer,
  type FakeResponse,
  type RecordedRequest,
} from "../test-support/fake-servers.js";
import { ConditionalCache } from "./conditional-cache.js";
import { observeCommitRelation, observeScmHead } from "./scm.js";

const TOKEN = "ghp_TESTTOKEN_do_not_leak_0123456789";
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
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
  over: { cache?: ConditionalCache; branch?: string; at?: string } = {},
) =>
  observeScmHead({
    apiUrl,
    repo: "acme/widgets",
    branch: over.branch ?? "main",
    timeoutMs: 1000,
    token: TOKEN,
    ...(over.cache ? { cache: over.cache } : {}),
    ...(over.at ? { now: () => new Date(over.at!) } : {}),
  });
const relation = (apiUrl: string, cache?: ConditionalCache) =>
  observeCommitRelation({
    apiUrl,
    repo: "acme/widgets",
    claimedCommit: sha(1),
    headSha: sha(2),
    timeoutMs: 1000,
    ...(cache ? { cache } : {}),
  });

describe("rate limit classification", () => {
  it.each([
    ["403 with x-ratelimit-remaining 0", 403, { "x-ratelimit-remaining": "0" }],
    ["429 with x-ratelimit-remaining 0", 429, { "x-ratelimit-remaining": "0" }],
    ["429 with no rate-limit header", 429, {}],
    ["429 with remaining > 0", 429, { "x-ratelimit-remaining": "7" }],
  ] as Array<[string, number, Record<string, string>]>)(
    "%s is rate_limited",
    async (_n, status, headers) => {
      const server = await github(() => ({
        status,
        headers,
        body: { message: "API rate limit exceeded" },
      }));
      expect(await head(server.url)).toMatchObject({
        outcome: "UNKNOWN",
        reason: "rate_limited",
        httpStatus: status,
        sha: null,
      });
      expect(await relation(server.url)).toMatchObject({
        outcome: "UNKNOWN",
        reason: "rate_limited",
        httpStatus: status,
      });
    },
  );
  it.each([
    ["403 with no rate-limit header", {}],
    ["403 with remaining > 0", { "x-ratelimit-remaining": "42" }],
    ["403 with a non-numeric remaining", { "x-ratelimit-remaining": "zero" }],
    ["403 with an empty remaining", { "x-ratelimit-remaining": "" }],
  ] as Array<[string, Record<string, string>]>)(
    "%s stays http_status_403",
    async (_n, headers) => {
      const server = await github(() => ({
        status: 403,
        headers,
        body: { message: "Forbidden" },
      }));
      expect(await head(server.url)).toMatchObject({
        reason: "http_status_403",
        httpStatus: 403,
      });
    },
  );
  it("does not call a 200 with remaining 0 rate limited", async () => {
    const server = await github(() => ({
      body: refBody(),
      headers: { "x-ratelimit-remaining": "0" },
    }));
    expect(await head(server.url)).toMatchObject({
      outcome: "OBSERVED",
      reason: null,
    });
  });
  it("copies no header, body or error text into the observation", async () => {
    const server = await github(() => ({
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1999999999",
        "retry-after": "3599",
        "x-echo": TOKEN,
      },
      body: { message: `rate limit exceeded for ${TOKEN}` },
    }));
    const o = await head(server.url);
    expect(Object.keys(o).sort()).toEqual([
      "httpStatus",
      "kind",
      "observedAt",
      "outcome",
      "reason",
      "sha",
      "sourceUrl",
    ]);
    const text = JSON.stringify(o);
    for (const leaked of [TOKEN, "1999999999", "3599", "exceeded"])
      expect(text).not.toContain(leaked);
  });
});

describe("conditional requests (ETag / If-None-Match)", () => {
  it("sends If-None-Match on the second call and reuses the OBSERVED result on 304", async () => {
    const server = await github((r) =>
      r.headers["if-none-match"] === '"v1"'
        ? { status: 304, body: "" }
        : { body: refBody(sha(7)), headers: { etag: '"v1"' } },
    );
    const cache = new ConditionalCache();
    const first = await head(server.url, {
      cache,
      at: "2026-03-04T10:00:00.000Z",
    });
    const second = await head(server.url, {
      cache,
      at: "2026-03-04T10:05:00.000Z",
    });
    expect(server.requests[0]!.headers["if-none-match"]).toBeUndefined();
    expect(server.requests[1]!.headers["if-none-match"]).toBe('"v1"');
    expect(first).toMatchObject({ httpStatus: 200, sha: sha(7) });
    expect(second).toMatchObject({
      kind: "scm_head",
      outcome: "OBSERVED",
      sha: sha(7),
      reason: null,
      httpStatus: 304,
      observedAt: "2026-03-04T10:05:00.000Z",
      sourceUrl: first.sourceUrl,
    });
  });
  it("takes a changed ETag as new content and uses it next time", async () => {
    let etag = '"v1"';
    let commit = sha(7);
    const server = await github((r) =>
      r.headers["if-none-match"] === etag
        ? { status: 304, body: "" }
        : { body: refBody(commit), headers: { etag } },
    );
    const cache = new ConditionalCache();
    await head(server.url, { cache });
    etag = '"v2"';
    commit = sha(8);
    const changed = await head(server.url, { cache });
    expect(changed).toMatchObject({ httpStatus: 200, sha: sha(8) });
    expect(server.requests[1]!.headers["if-none-match"]).toBe('"v1"');
    const again = await head(server.url, { cache });
    expect(server.requests[2]!.headers["if-none-match"]).toBe('"v2"');
    expect(again).toMatchObject({ httpStatus: 304, sha: sha(8) });
  });
  it("keeps a separate ETag per URL", async () => {
    const server = await github((r) => ({
      body: refBody(),
      headers: { etag: r.url.includes("/dev") ? '"dev"' : '"main"' },
    }));
    const cache = new ConditionalCache();
    await head(server.url, { cache, branch: "main" });
    await head(server.url, { cache, branch: "dev" });
    await head(server.url, { cache, branch: "main" });
    await head(server.url, { cache, branch: "dev" });
    expect(server.requests.map((q) => q.headers["if-none-match"])).toEqual([
      undefined,
      undefined,
      '"main"',
      '"dev"',
    ]);
  });
  it("sends no If-None-Match without a cache, and an unsolicited 304 is not reused", async () => {
    const server = await github(() => ({ status: 304, body: "" }));
    const o = await head(server.url);
    expect(server.requests[0]!.headers["if-none-match"]).toBeUndefined();
    expect(o).toMatchObject({
      outcome: "UNKNOWN",
      reason: "redirect_not_followed",
    });
  });
  it("a fresh cache (a process restart) sends no If-None-Match", async () => {
    const server = await github(() => ({
      body: refBody(),
      headers: { etag: '"v1"' },
    }));
    await head(server.url, { cache: new ConditionalCache() });
    await head(server.url, { cache: new ConditionalCache() });
    expect(server.requests.map((q) => q.headers["if-none-match"])).toEqual([
      undefined,
      undefined,
    ]);
  });
  it("does not remember an invalid payload or an unusable ETag", async () => {
    const bad = await github(() => ({
      body: { object: {} },
      headers: { etag: '"bad"' },
    }));
    const cache = new ConditionalCache();
    expect(await head(bad.url, { cache })).toMatchObject({
      reason: "invalid_payload",
    });
    await head(bad.url, { cache });
    expect(bad.requests[1]!.headers["if-none-match"]).toBeUndefined();
    await bad.close();
    const huge = await github(() => ({
      body: refBody(),
      headers: { etag: `"${"x".repeat(600)}"` },
    }));
    await head(huge.url, { cache });
    await head(huge.url, { cache });
    expect(huge.requests[1]!.headers["if-none-match"]).toBeUndefined();
  });
  it("after a failure keeps the last good ETag, and a later 304 recovers the result", async () => {
    let mode: "ok" | "down" | "same" = "ok";
    const server = await github((r) => {
      if (mode === "down") return { status: 500 };
      if (mode === "same" && r.headers["if-none-match"] === '"v1"')
        return { status: 304, body: "" };
      return { body: refBody(), headers: { etag: '"v1"' } };
    });
    const cache = new ConditionalCache();
    await head(server.url, { cache });
    mode = "down";
    expect(await head(server.url, { cache })).toMatchObject({
      reason: "http_status_500",
      sha: null,
    });
    mode = "same";
    expect(await head(server.url, { cache })).toMatchObject({
      outcome: "OBSERVED",
      httpStatus: 304,
      sha: sha(7),
    });
  });
  it("reuses a compare result on 304 as well", async () => {
    const server = await github((r) =>
      r.headers["if-none-match"] === '"c1"'
        ? { status: 304, body: "" }
        : {
            body: { status: "ahead", ahead_by: 3, behind_by: 0 },
            headers: { etag: '"c1"' },
          },
    );
    const cache = new ConditionalCache();
    await relation(server.url, cache);
    expect(await relation(server.url, cache)).toMatchObject({
      outcome: "OBSERVED",
      relation: "claimed_behind",
      behindBy: 3,
      aheadBy: 0,
      httpStatus: 304,
    });
  });
  it("never puts the ETag, token or body into the observation", async () => {
    const server = await github((r) =>
      r.headers["if-none-match"]
        ? { status: 304, body: "" }
        : { body: refBody(), headers: { etag: '"secret-etag-value"' } },
    );
    const cache = new ConditionalCache();
    await head(server.url, { cache });
    const text = JSON.stringify(await head(server.url, { cache }));
    expect(text).not.toContain("secret-etag-value");
    expect(text).not.toContain(TOKEN);
  });
});

describe("ConditionalCache", () => {
  it("is bounded: the oldest entry is evicted", () => {
    const cache = new ConditionalCache(2);
    cache.set("a", '"1"', { n: 1 });
    cache.set("b", '"2"', { n: 2 });
    cache.set("c", '"3"', { n: 3 });
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toEqual({ etag: '"3"', json: { n: 3 } });
  });
});
