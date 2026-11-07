import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./test-support/platform-harness.js";
import { startFakeServer } from "./test-support/fake-servers.js";
import { PostgresQuota } from "./platform/media-quota.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const KEY = "TEST-ACCESS-KEY-not-real";

const photo = (id: string, desc: string) => ({
  id,
  width: 4000,
  height: 2667,
  color: "#cc9966",
  alt_description: desc,
  urls: {
    raw: `https://images.unsplash.com/photo-${id}?ixid=zz${id}&ixlib=rb-4.0`,
    regular: "https://images.unsplash.com/x",
  },
  links: {
    html: `https://unsplash.com/photos/${id}`,
    download_location: `https://api.unsplash.com/photos/${id}/download?ixid=zz${id}`,
  },
  user: {
    name: `Maker ${id}`,
    links: { html: `https://unsplash.com/@maker${id}` },
  },
});

let h: Harness;
let fake: Awaited<ReturnType<typeof startFakeServer>>;
beforeAll(async () => {
  if (!enabled) return;
  fake = await startFakeServer((r) =>
    r.url.startsWith("/search")
      ? {
          body: {
            results: [
              photo("p1", "a celebration cake with berries"),
              photo("p2", "wedding cake detail"),
              photo("p3", "a mountain lake"),
            ],
          },
          headers: { "x-ratelimit-remaining": "45" },
        }
      : { body: { url: "https://images.unsplash.com/ignored" } },
  );
  h = await startHarness({
    env: {
      KORA_CREATIVE_ENGINE: "v3",
      KORA_MEDIA_UNSPLASH: "on",
      UNSPLASH_ACCESS_KEY: KEY,
      UNSPLASH_APP_NAME: "kora-test",
      UNSPLASH_API_BASE: fake.url,
      UNSPLASH_RATE_LIMIT: "50",
      UNSPLASH_RESERVE: "10",
    },
  });
});
afterAll(async () => {
  if (!enabled) return;
  await h.close();
  await fake.close();
});

d("stock photos: owner-approved, attributed, quota-safe", () => {
  it("offers candidates in few searches, records the download only on selection, places through a normal edit, and credits the photographer on the published site", async () => {
    const o = await h.signup("media-owner@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: {
          orgId: o.orgId,
          name: "Sweet Crumbs Bakery",
          description: "I bake cakes and small chops.",
        },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: {
        name: "Sweet Crumbs Bakery",
        description: "I bake cakes and small chops.",
      },
    });
    expect(gen.status).toBe(201);

    const provs = (
      await h.call("GET", "/api/media/providers", { cookie: o.cookie })
    ).json.data;
    expect(provs.providers).toEqual([{ id: "unsplash", status: "AVAILABLE" }]);

    const before = fake.requests.length;
    const cands = await h.call(
      "POST",
      `/api/sites/${site.id}/media/candidates`,
      { cookie: o.cookie, body: {} },
    );
    expect(cands.status).toBe(200);
    const searches = fake.requests.length - before;
    expect(searches).toBeGreaterThanOrEqual(2);
    expect(searches).toBeLessThanOrEqual(4);
    expect(
      cands.json.data.candidates.every(
        (c: { requiresOwnerApproval: boolean }) => c.requiresOwnerApproval,
      ),
    ).toBe(true);
    expect(fake.requests.some((r) => r.url.includes("/download"))).toBe(false); // searching is not selecting

    // a repeat for the same business (e.g. another direction) is served from the cache
    const again = fake.requests.length;
    await h.call("POST", `/api/sites/${site.id}/media/candidates`, {
      cookie: o.cookie,
      body: {},
    });
    expect(fake.requests.length).toBe(again);

    const sel = await h.call("POST", `/api/sites/${site.id}/media/select`, {
      cookie: o.cookie,
      body: { provider: "unsplash", id: "p1" },
    });
    expect(sel.status).toBe(200);
    expect(
      fake.requests.filter((r) => r.url.includes("/photos/p1/download")),
    ).toHaveLength(1);
    const media = sel.json.data.media;
    expect(media.provenance.creatorUrl).toContain("utm_source=kora-test");
    expect(JSON.stringify(cands.json) + JSON.stringify(sel.json)).not.toContain(
      KEY,
    );

    const v = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${gen.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    const gp = v.spec.pages.find((p: { slug: string }) => p.slug === "gallery");
    const gi = gp.sections.findIndex(
      (s: { type: string }) => s.type === "gallery",
    );
    const ed = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        designEdit: {
          kind: "replace-media",
          page: "gallery",
          index: gi,
          item: 0,
          media,
        },
      },
    });
    expect(ed.status).toBe(201);
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${ed.json.data.version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.json.data.verification.status).toBe("MATCH");
    const html = await (
      await fetch(`${pub.json.data.publicUrl}gallery/`)
    ).text();
    expect(html).toContain("images.unsplash.com/photo-p1");
    expect(html).toContain("ixid=zzp1");
    const man = (
      await h.call(
        "GET",
        `/api/sites/${site.id}/versions/${ed.json.data.version.id}/media-manifest`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(man.manifest.summary.needsCredit).toBe(1);
    expect(man.manifest.summary.creditedInFooter).toBe(1);
    expect(
      man.manifest.entries.some(
        (e: { provider: string; creator: string }) =>
          e.provider === "Unsplash" && e.creator === "Maker p1",
      ),
    ).toBe(true);
    expect(man.replacementHistory).toHaveLength(1);
    expect(man.replacementHistory[0].replacements[0].to).toContain("photo-p1");
    expect(html).toMatch(
      /Photos: <a href="https:\/\/unsplash\.com\/@makerp1\?[^"]*utm_source=kora-test[^"]*" rel="noopener noreferrer">Maker p1<\/a> on <a href="https:\/\/unsplash\.com\/\?utm_source=kora-test/,
    );
  });

  it("will not select a picture it never offered, and not for another account's offer", async () => {
    const a = await h.signup("media-a@example.com");
    const b = await h.signup("media-b@example.com");
    const sa = (
      await h.call("POST", "/api/sites", {
        cookie: a.cookie,
        body: {
          orgId: a.orgId,
          name: "A Cakes",
          description: "I bake cakes and pastries.",
        },
      })
    ).json.data;
    const sb = (
      await h.call("POST", "/api/sites", {
        cookie: b.cookie,
        body: {
          orgId: b.orgId,
          name: "B Cakes",
          description: "I bake cakes and pastries.",
        },
      })
    ).json.data;
    await h.call("POST", `/api/sites/${sa.id}/media/candidates`, {
      cookie: a.cookie,
      body: { intents: ["celebration cakes"] },
    });
    expect(
      (
        await h.call("POST", `/api/sites/${sa.id}/media/select`, {
          cookie: a.cookie,
          body: { provider: "unsplash", id: "not-offered" },
        })
      ).status,
    ).toBe(410);
    expect(
      (
        await h.call("POST", `/api/sites/${sb.id}/media/select`, {
          cookie: b.cookie,
          body: { provider: "unsplash", id: "p1" },
        })
      ).status,
    ).toBe(410);
    expect(
      (
        await h.call("POST", `/api/sites/${sa.id}/media/select`, {
          cookie: b.cookie,
          body: { provider: "unsplash", id: "p1" },
        })
      ).status,
    ).toBe(404);
  });

  it("an edit cannot smuggle in an unsafe picture URL", async () => {
    const o = await h.signup("media-unsafe@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: {
          orgId: o.orgId,
          name: "Safe Cakes",
          description: "I bake cakes and small chops.",
        },
      })
    ).json.data;
    const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
      cookie: o.cookie,
      body: {
        name: "Safe Cakes",
        description: "I bake cakes and small chops.",
      },
    });
    const r = await h.call("POST", `/api/sites/${site.id}/edit`, {
      cookie: o.cookie,
      body: {
        baseVersionId: gen.json.data.version.id,
        designEdit: {
          kind: "replace-media",
          page: "gallery",
          index: 1,
          item: 0,
          media: { url: "javascript:alert(1)", alt: "x" },
        },
      },
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("the hourly allowance is shared across instances: 80 concurrent spends over two counters admit exactly 40 (50 minus a reserve of 10)", async () => {
    const a = new PostgresQuota(h.sql);
    const b = new PostgresQuota(h.sql);
    const now = Date.now() + 5 * 3_600_000; // a fresh window, independent of the tests above
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        (i % 2 ? a : b).tryConsume("unsplash", 50, 10, now),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(40);
    await a.observe("unsplash", 3, 50, now);
    expect((await b.tryConsume("unsplash", 50, 10, now)).allowed).toBe(false);
  });

  it("one account cannot drain the shared allowance: searches are limited per organisation, and selecting twice records one download", async () => {
    const o = await h.signup("media-abuse@example.com");
    const site = (
      await h.call("POST", "/api/sites", {
        cookie: o.cookie,
        body: {
          orgId: o.orgId,
          name: "Abuse Cakes",
          description: "I bake cakes and pastries.",
        },
      })
    ).json.data;
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++)
      statuses.push(
        (
          await h.call("POST", `/api/sites/${site.id}/media/candidates`, {
            cookie: o.cookie,
            body: { intents: [`fresh query ${i} ${crypto.randomUUID()}`] },
          })
        ).status,
      );
    expect(statuses.filter((x) => x === 200)).toHaveLength(6);
    expect(statuses.filter((x) => x === 429)).toHaveLength(2);

    const o2 = await h.signup("media-dedupe@example.com");
    const s2 = (
      await h.call("POST", "/api/sites", {
        cookie: o2.cookie,
        body: {
          orgId: o2.orgId,
          name: "Dedupe Cakes",
          description: "I bake cakes and pastries.",
        },
      })
    ).json.data;
    await h.call("POST", `/api/sites/${s2.id}/media/candidates`, {
      cookie: o2.cookie,
      body: { intents: ["dedupe cake"] },
    });
    const before = fake.requests.filter((r) =>
      r.url.includes("/photos/p2/download"),
    ).length;
    for (let i = 0; i < 3; i++)
      expect(
        (
          await h.call("POST", `/api/sites/${s2.id}/media/select`, {
            cookie: o2.cookie,
            body: { provider: "unsplash", id: "p2" },
          })
        ).status,
      ).toBe(200);
    expect(
      fake.requests.filter((r) => r.url.includes("/photos/p2/download"))
        .length - before,
    ).toBe(1);
  });

  it("shows configuration detail to an administrator and not to a plain member", async () => {
    const owner = await h.signup("media-cfg-owner@example.com");
    const r1 = await h.call("GET", "/api/media/providers", {
      cookie: owner.cookie,
    });
    expect(r1.json.data.configurationProblems).toEqual([]);
    // a user who is only a MEMBER everywhere: drop their own admin membership so no ADMIN/OWNER role remains
    const member = await h.signup("media-cfg-member@example.com");
    await h.sql`UPDATE organization_memberships SET role='MEMBER' WHERE user_id=${member.userId}`;
    const r2 = await h.call("GET", "/api/media/providers", {
      cookie: member.cookie,
    });
    expect(r2.status).toBe(200);
    expect(r2.json.data).not.toHaveProperty("configurationProblems");
  });
});
