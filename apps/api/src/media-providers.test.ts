import { afterEach, describe, expect, it } from "vitest";
import {
  InMemoryPoolCache,
  InMemoryQuota,
  ProviderError,
  UnsplashProvider,
  buildCandidatePool,
  loadUnsplashConfig,
  rankCandidates,
  type MediaProvider,
} from "@kora/site-media";
import { startFakeServer } from "./test-support/fake-servers.js";

const photo = (id: string, desc: string, w = 4000, h = 2667) => ({
  id,
  width: w,
  height: h,
  color: "#aabbcc",
  alt_description: desc,
  urls: {
    raw: `https://images.unsplash.com/photo-${id}?ixid=abc123&ixlib=rb-4.0`,
    regular: `https://images.unsplash.com/photo-${id}?w=1080`,
  },
  links: {
    html: `https://unsplash.com/photos/${id}`,
    download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc123`,
  },
  user: {
    name: `Maker ${id}`,
    links: { html: `https://unsplash.com/@maker${id}` },
  },
});
const key = "TEST-ACCESS-KEY-not-real";
const cfg = (api: string, o: Record<string, string> = {}) =>
  loadUnsplashConfig({
    KORA_MEDIA_UNSPLASH: "on",
    UNSPLASH_ACCESS_KEY: key,
    UNSPLASH_APP_NAME: "kora-test",
    UNSPLASH_API_BASE: api,
    ...o,
  }).config;

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

describe("Unsplash configuration contract", () => {
  it("is off by default and needs nothing", () => {
    const r = loadUnsplashConfig({});
    expect(r.config.enabled).toBe(false);
    expect(r.problems).toEqual([]);
  });
  it("names exactly what is missing when switched on without credentials", () => {
    const r = loadUnsplashConfig({ KORA_MEDIA_UNSPLASH: "on" });
    expect(r.problems.join(" ")).toMatch(/UNSPLASH_ACCESS_KEY/);
    expect(r.problems.join(" ")).toMatch(/UNSPLASH_APP_NAME/);
  });
  it("rejects nonsense limits and a reserve that would leave no allowance", () => {
    expect(
      loadUnsplashConfig({ UNSPLASH_RATE_LIMIT: "abc" }).problems.join(),
    ).toMatch(/UNSPLASH_RATE_LIMIT/);
    expect(
      loadUnsplashConfig({
        UNSPLASH_RATE_LIMIT: "10",
        UNSPLASH_RESERVE: "10",
      }).problems.join(),
    ).toMatch(/UNSPLASH_RESERVE/);
  });
  it("refuses a non-https API base outside loopback", () => {
    expect(
      loadUnsplashConfig({
        KORA_MEDIA_UNSPLASH: "on",
        UNSPLASH_ACCESS_KEY: "k",
        UNSPLASH_APP_NAME: "ab",
        UNSPLASH_API_BASE: "http://evil.example",
      }).problems.join(),
    ).toMatch(/https/);
  });
  it("is unavailable, and never calls the network, when not configured", async () => {
    let called = false;
    const p = new UnsplashProvider({
      config: loadUnsplashConfig({}).config,
      fetch: () => {
        called = true;
        return Promise.resolve(new Response("{}"));
      },
    });
    expect(p.available()).toBe(false);
    await expect(p.search({ query: "cake" })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(called).toBe(false);
  });
});

describe("Unsplash adapter against a fake server (no real network, no real key)", () => {
  it("sends the key only in the Authorization header, and returns hotlinked, attributed, owner-approval candidates", async () => {
    const s = await startFakeServer(() => ({
      body: { results: [photo("a1", "a celebration cake with strawberries")] },
      headers: { "x-ratelimit-remaining": "49" },
    }));
    close = s.close;
    const p = new UnsplashProvider({ config: cfg(s.url) });
    const out = await p.search({
      query: "celebration cakes",
      orientation: "landscape",
    });
    expect(s.requests[0]!.headers.authorization).toBe(`Client-ID ${key}`);
    expect(s.requests[0]!.url).not.toContain(key);
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.displayUrl).toContain("images.unsplash.com");
    expect(c.displayUrl).toContain("ixid=abc123"); // tracking parameter preserved
    expect(c.creator.profileUrl).toContain("utm_source=kora-test");
    expect(c.creator.profileUrl).toContain("utm_medium=referral");
    expect(c.sourceUrl).toContain("utm_source=kora-test");
    expect(c.attribution).toBe("Photo by Maker a1 on Unsplash");
    expect(c.placement).toBe("owner-approval");
    expect(JSON.stringify(out)).not.toContain(key);
  });
  it("records the download event only when a person selects a picture, never on search", async () => {
    const s = await startFakeServer((r) =>
      r.url.startsWith("/search")
        ? { body: { results: [photo("b2", "cake")] } }
        : { body: { url: "https://images.unsplash.com/x" } },
    );
    close = s.close;
    const p = new UnsplashProvider({ config: cfg(s.url) });
    const [c] = await p.search({ query: "cake" });
    expect(s.requests.some((r) => r.url.includes("/download"))).toBe(false);
    await p.recordSelection(c!);
    expect(
      s.requests.filter((r) => r.url.includes("/photos/b2/download")),
    ).toHaveLength(1);
    expect(p.stats.downloadsTracked).toBe(1);
  });
  it("discards results whose URLs point anywhere other than Unsplash, and malformed ones", async () => {
    const evil = photo("e1", "cake");
    evil.urls.raw = "https://evil.example/x.jpg";
    const s = await startFakeServer(() => ({
      body: { results: [evil, { id: "junk" }, photo("ok", "cake")] },
    }));
    close = s.close;
    const out = await new UnsplashProvider({ config: cfg(s.url) }).search({
      query: "cake",
    });
    expect(out.map((x) => x.id)).toEqual(["ok"]);
  });
  it("treats an invalid response shape as a provider error, not a crash", async () => {
    const s = await startFakeServer(() => ({ body: "not json at all{" }));
    close = s.close;
    await expect(
      new UnsplashProvider({ config: cfg(s.url) }).search({ query: "x" }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("keeps a safety reserve: with 50/hour and 10 reserved, only 40 requests are ever spent", async () => {
    const s = await startFakeServer(() => ({ body: { results: [] } }));
    close = s.close;
    const p = new UnsplashProvider({
      config: cfg(s.url),
      quota: new InMemoryQuota(),
      now: () => 1_000_000,
    });
    let ok = 0,
      refused = 0;
    for (let i = 0; i < 60; i++) {
      try {
        await p.search({ query: `q${i}` });
        ok++;
      } catch (e) {
        if ((e as ProviderError).code === "quota_reserved") refused++;
      }
    }
    expect(ok).toBe(40);
    expect(refused).toBe(20);
    expect(s.requests).toHaveLength(40);
  });
  it("honours X-Ratelimit-Remaining over its own count", async () => {
    const s = await startFakeServer(() => ({
      body: { results: [] },
      headers: { "x-ratelimit-remaining": "11" },
    }));
    close = s.close;
    const p = new UnsplashProvider({
      config: cfg(s.url),
      quota: new InMemoryQuota(),
      now: () => 5_000_000,
    });
    await p.search({ query: "a" }); // provider says only 11 left: next spend would leave 10 = reserve
    await p.search({ query: "b" });
    await expect(p.search({ query: "c" })).rejects.toMatchObject({
      code: "quota_reserved",
    });
    expect(s.requests).toHaveLength(2);
  });
  it("on a 429 stops asking for the rest of the window and says when to retry", async () => {
    const s = await startFakeServer(() => ({
      status: 429,
      body: {},
      headers: { "retry-after": "120" },
    }));
    close = s.close;
    const p = new UnsplashProvider({
      config: cfg(s.url),
      quota: new InMemoryQuota(),
      now: () => 9_000_000,
    });
    await expect(p.search({ query: "a" })).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 120_000,
    });
    await expect(p.search({ query: "b" })).rejects.toMatchObject({
      code: "quota_reserved",
    });
    expect(s.requests).toHaveLength(1);
    expect(p.stats.rateLimited).toBe(1);
  });
  it("reports a rejected key without echoing it", async () => {
    const s = await startFakeServer(() => ({
      status: 401,
      body: { errors: ["OAuth error"] },
    }));
    close = s.close;
    const e = await new UnsplashProvider({ config: cfg(s.url) })
      .search({ query: "a" })
      .catch((x: Error) => x);
    expect(e).toMatchObject({ code: "unauthorized" });
    expect((e as Error).message).not.toContain(key);
  });
});

describe("candidate pool: few searches, shared across directions, honest when providers fail", () => {
  const fake = (
    id: string,
    impl: MediaProvider["search"],
  ): MediaProvider & { calls: number } => {
    const o = {
      id,
      calls: 0,
      available: () => true,
      search: async (r: Parameters<MediaProvider["search"]>[0]) => {
        o.calls++;
        return impl(r);
      },
    };
    return o;
  };
  const cand = (id: string, d: string) => ({
    id,
    provider: "fake",
    description: d,
    displayUrl: "https://x.example/" + id,
    width: 4000,
    height: 2667,
    orientation: "landscape" as const,
    creator: { name: "n", profileUrl: "https://x.example/n" },
    sourceUrl: "https://x.example/s",
    attribution: "a",
    licence: "l",
    licenceUrl: "https://x.example/l",
    rights: "provider-licence" as const,
    placement: "owner-approval" as const,
    fetchedAt: "2026-01-01",
  });
  it("spends at most the generation budget and de-duplicates identical intents", async () => {
    const p = fake("fake", (r) => Promise.resolve([cand(r.query, r.query)]));
    const res = await buildCandidatePool({
      intents: [
        "celebration cakes",
        "Celebration  Cakes",
        "small chops",
        "bakery preparation",
        "artisan pastry",
        "sixth query",
      ],
      providers: [p],
      budget: 4,
    });
    expect(p.calls).toBe(4);
    expect(res.report.providerCalls).toBe(4);
  });
  it("a second pool for the same business (the other two directions) costs nothing", async () => {
    const p = fake("fake", (r) => Promise.resolve([cand(r.query, r.query)]));
    const cache = new InMemoryPoolCache();
    const intents = ["celebration cakes", "small chops"];
    await buildCandidatePool({ intents, providers: [p], cache });
    const again = await buildCandidatePool({ intents, providers: [p], cache });
    expect(p.calls).toBe(2);
    expect(again.report.cacheHits).toBe(2);
    expect(again.report.providerCalls).toBe(0);
  });
  it("survives a provider outage and reports it instead of hiding it", async () => {
    const p = fake("fake", () =>
      Promise.reject(new ProviderError("upstream", "down")),
    );
    const res = await buildCandidatePool({
      intents: ["a cake", "b cake"],
      providers: [p],
    });
    expect(res.candidates).toEqual([]);
    expect(res.report.failures.length).toBeGreaterThan(0);
  });
  it("stops using a provider for the rest of the generation after a rate limit", async () => {
    const p = fake("fake", () =>
      Promise.reject(new ProviderError("rate_limited", "slow down")),
    );
    await buildCandidatePool({
      intents: ["a cake", "b cake", "c cake"],
      providers: [p],
    });
    expect(p.calls).toBe(1);
  });
  it("skips unavailable providers with no call and no error", async () => {
    const p = {
      ...fake("fake", () => Promise.resolve([])),
      available: () => false,
    };
    const res = await buildCandidatePool({
      intents: ["a cake"],
      providers: [p],
    });
    expect(res.report.skipped[0]!.reason).toMatch(/not available/);
  });
  it("ranks by subject relevance and never offers a picture that does not mention the subject", () => {
    const ranked = rankCandidates(
      [
        cand("1", "a wedding cake with flowers"),
        cand("2", "a mountain at sunrise"),
      ],
      { subject: "wedding cake", orientation: "landscape" },
    );
    expect(ranked.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("Unsplash adapter: hostile provider responses", () => {
  it("drops http:// URLs and refuses a download location outside /photos/<id>/download", async () => {
    const http1 = photo("h1", "cake");
    http1.urls.raw = "http://images.unsplash.com/photo-h1?ixid=1";
    const odd = photo("o1", "cake");
    odd.links.download_location = "https://api.unsplash.com/me?x=1";
    const s = await startFakeServer(() => ({
      body: { results: [http1, odd, photo("good", "cake")] },
    }));
    close = s.close;
    const p = new UnsplashProvider({ config: cfg(s.url) });
    const found = await p.search({ query: "cake" });
    expect(found.map((x) => x.id)).toEqual(["o1", "good"]);
    await expect(p.recordSelection(found[0]!)).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(s.requests.some((r) => r.url.startsWith("/me"))).toBe(false);
  });
  it("a hostile X-Ratelimit-Remaining value cannot break the search or the accounting", async () => {
    const s = await startFakeServer(() => ({
      body: { results: [] },
      headers: { "x-ratelimit-remaining": "-99999999999999" },
    }));
    close = s.close;
    const p = new UnsplashProvider({
      config: cfg(s.url),
      quota: new InMemoryQuota(),
      now: () => 77_000_000,
    });
    await expect(p.search({ query: "a" })).resolves.toEqual([]);
    await expect(p.search({ query: "b" })).rejects.toMatchObject({
      code: "quota_reserved",
    });
  });
});
