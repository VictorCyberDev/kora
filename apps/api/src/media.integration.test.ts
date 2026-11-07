import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { deriveMediaKey, signToken } from "@kora/site-media";
import { startHarness, type Harness } from "./test-support/platform-harness.js";
import { startFakeServer } from "./test-support/fake-servers.js";
import { PostgresQuota } from "./platform/media-quota.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
const KEY = "TEST-ACCESS-KEY-not-real";
const SECRET = randomBytes(32).toString("base64");
const signingKey = deriveMediaKey(SECRET)!;

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

let a: Harness; // two API instances sharing one database, as in production
let b: Harness;
let fake: Awaited<ReturnType<typeof startFakeServer>>;
const env = (api: string) => ({
  KORA_CREATIVE_ENGINE: "v3",
  KORA_MEDIA_UNSPLASH: "on",
  UNSPLASH_ACCESS_KEY: KEY,
  UNSPLASH_APP_NAME: "kora-test",
  UNSPLASH_API_BASE: api,
  UNSPLASH_RATE_LIMIT: "50",
  UNSPLASH_RESERVE: "10",
  KORA_SECRETS_KEY: SECRET,
});
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
  a = await startHarness({ env: env(fake.url) });
  b = await startHarness({ env: env(fake.url) });
});
afterAll(async () => {
  if (!enabled) return;
  await a.close();
  await b.close();
  await fake.close();
});

const mkSite = async (h: Harness, email: string, name: string) => {
  const o = await h.signup(email);
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: o.cookie,
      body: {
        orgId: o.orgId,
        name,
        description: "I bake cakes and small chops.",
      },
    })
  ).json.data;
  const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: o.cookie,
    body: { name, description: "I bake cakes and small chops." },
  });
  return { o, site, versionId: gen.json.data.version.id as string };
};
const galleryEdit = async (
  h: Harness,
  o: { cookie: string },
  siteId: string,
  versionId: string,
  extra: Record<string, unknown>,
) => {
  const v = (
    await h.call("GET", `/api/sites/${siteId}/versions/${versionId}`, {
      cookie: o.cookie,
    })
  ).json.data;
  const gp = v.spec.pages.find((p: { slug: string }) => p.slug === "gallery");
  const gi = gp.sections.findIndex(
    (s: { type: string }) => s.type === "gallery",
  );
  return h.call("POST", `/api/sites/${siteId}/edit`, {
    cookie: o.cookie,
    body: {
      baseVersionId: versionId,
      designEdit: {
        kind: "replace-media",
        page: "gallery",
        index: gi,
        item: 0,
        ...extra,
      },
    },
  });
};

d("stock photos: server-vouched, attributed, shared across instances", () => {
  it("search on instance A, select on instance B, place through a verified edit, credit on the published site, one download event", async () => {
    const { o, site, versionId } = await mkSite(
      a,
      "m-owner@example.com",
      "Sweet Crumbs Bakery",
    );
    const before = fake.requests.length;
    const cands = await a.call(
      "POST",
      `/api/sites/${site.id}/media/candidates`,
      { cookie: o.cookie, body: {} },
    );
    expect(cands.status).toBe(200);
    expect(fake.requests.length - before).toBeGreaterThanOrEqual(2);
    expect(fake.requests.length - before).toBeLessThanOrEqual(4);
    expect(fake.requests.some((r) => r.url.includes("/download"))).toBe(false);
    const c1 = cands.json.data.candidates.find(
      (c: { id: string }) => c.id === "p1",
    );
    expect(JSON.stringify(cands.json)).not.toContain(KEY);

    // a repeat search (e.g. another direction, or the other instance) is served from the shared cache
    const mid = fake.requests.length;
    const again = await b.call(
      "POST",
      `/api/sites/${site.id}/media/candidates`,
      { cookie: o.cookie, body: {} },
    );
    expect(again.status).toBe(200);
    expect(fake.requests.length).toBe(mid);

    // the selection lands on a different instance than the search: it works, because the token carries the proof
    const sel = await b.call("POST", `/api/sites/${site.id}/media/select`, {
      cookie: o.cookie,
      body: { candidateToken: c1.candidateToken },
    });
    expect(sel.status).toBe(200);
    // selecting again on either instance records no second download event
    await a.call("POST", `/api/sites/${site.id}/media/select`, {
      cookie: o.cookie,
      body: { candidateToken: c1.candidateToken },
    });
    expect(
      fake.requests.filter((r) => r.url.includes("/photos/p1/download")),
    ).toHaveLength(1);
    const { media, selectionToken } = sel.json.data;
    expect(media.provenance.creatorUrl).toContain("utm_source=kora-test");

    const ed = await galleryEdit(a, o, site.id, versionId, {
      media,
      selectionToken,
    });
    expect(ed.status).toBe(201);
    const pub = await a.call(
      "POST",
      `/api/sites/${site.id}/versions/${ed.json.data.version.id}/publish`,
      { cookie: o.cookie },
    );
    expect(pub.json.data.verification.status).toBe("MATCH");
    const html = await (
      await fetch(`${pub.json.data.publicUrl}gallery/`)
    ).text();
    expect(html).toContain("images.unsplash.com/photo-p1");
    expect(html).toMatch(
      /Photos: <a href="https:\/\/unsplash\.com\/@makerp1\?[^"]*utm_source=kora-test[^"]*" rel="noopener noreferrer">Maker p1<\/a> on <a href="https:\/\/unsplash\.com\/\?utm_source=kora-test/,
    );
    const man = (
      await a.call(
        "GET",
        `/api/sites/${site.id}/versions/${ed.json.data.version.id}/media-manifest`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(man.manifest.summary.needsCredit).toBe(1);
    expect(man.replacementHistory).toHaveLength(1);
  });

  it("forgery is refused: no token, a forged token, another site's token, a tampered credit, a swapped picture, an expired token", async () => {
    const { o, site, versionId } = await mkSite(
      a,
      "m-forge@example.com",
      "Forge Cakes",
    );
    const other = await mkSite(a, "m-forge-other@example.com", "Other Cakes");
    const cands = await a.call(
      "POST",
      `/api/sites/${site.id}/media/candidates`,
      { cookie: o.cookie, body: { intents: ["forge cake"] } },
    );
    const c = cands.json.data.candidates.find(
      (x: { id: string }) => x.id === "p1",
    );
    const sel = (
      await a.call("POST", `/api/sites/${site.id}/media/select`, {
        cookie: o.cookie,
        body: { candidateToken: c.candidateToken },
      })
    ).json.data;
    const bad = async (extra: Record<string, unknown>) =>
      (await galleryEdit(a, o, site.id, versionId, extra)).status;
    expect(await bad({ media: sel.media })).toBeGreaterThanOrEqual(400); // no token
    expect(
      await bad({ media: sel.media, selectionToken: "v1.forged.forged" }),
    ).toBeGreaterThanOrEqual(400);
    // a perfectly valid token issued for a different site
    const otherSel = signToken(
      {
        k: "sel",
        org: other.o.orgId,
        site: other.site.id,
        exp: Date.now() + 60_000,
        fp: "x",
      },
      signingKey,
    );
    expect(
      await bad({ media: sel.media, selectionToken: otherSel }),
    ).toBeGreaterThanOrEqual(400);
    // the credit rewritten to point at someone else, or a different picture, under the genuine token
    expect(
      await bad({
        media: {
          ...sel.media,
          provenance: {
            ...sel.media.provenance,
            creatorUrl: "https://unsplash.com/@someone-else",
          },
        },
        selectionToken: sel.selectionToken,
      }),
    ).toBeGreaterThanOrEqual(400);
    expect(
      await bad({
        media: { ...sel.media, url: "https://images.unsplash.com/photo-other" },
        selectionToken: sel.selectionToken,
      }),
    ).toBeGreaterThanOrEqual(400);
    // expired
    const fp = (await import("@kora/site-media")).mediaFingerprint(sel.media);
    const expired = signToken(
      { k: "sel", org: o.orgId, site: site.id, exp: Date.now() - 1000, fp },
      signingKey,
    );
    expect(
      await bad({ media: sel.media, selectionToken: expired }),
    ).toBeGreaterThanOrEqual(400);
    // the genuine one works
    expect(
      await bad({ media: sel.media, selectionToken: sel.selectionToken }),
    ).toBe(201);
    // candidate tokens: tampered payload, another site's, expired
    const parts = c.candidateToken.split(".");
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], "base64url").toString()), c: { ...JSON.parse(Buffer.from(parts[1], "base64url").toString()).c, displayUrl: "https://evil.example/x.jpg" } })).toString("base64url")}.${parts[2]}`;
    expect(
      (
        await a.call("POST", `/api/sites/${site.id}/media/select`, {
          cookie: o.cookie,
          body: { candidateToken: tampered },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call("POST", `/api/sites/${other.site.id}/media/select`, {
          cookie: other.o.cookie,
          body: { candidateToken: c.candidateToken },
        })
      ).status,
    ).toBe(403);
    const oldCand = signToken(
      {
        k: "cand",
        org: o.orgId,
        site: site.id,
        exp: Date.now() - 1000,
        c: {
          id: "p9",
          provider: "unsplash",
          description: "x",
          displayUrl: "https://images.unsplash.com/photo-p9",
          width: 1,
          height: 1,
          creator: { name: "n", profileUrl: "https://unsplash.com/@n" },
          sourceUrl: "https://unsplash.com/photos/p9",
          attribution: "a",
          licence: "l",
          placement: "owner-approval",
        },
      },
      signingKey,
    );
    expect(
      (
        await a.call("POST", `/api/sites/${site.id}/media/select`, {
          cookie: o.cookie,
          body: { candidateToken: oldCand },
        })
      ).status,
    ).toBe(410);
  });

  it("owner pictures must be this site's own uploads; the bundled catalogue supplies its own credit", async () => {
    const { o, site, versionId } = await mkSite(
      a,
      "m-own@example.com",
      "Own Cakes",
    );
    const sha = "a".repeat(64);
    const url = `https://media.example.com/api/public/sites/${site.id}/m/${sha}/w1280.webp`;
    const owner = {
      url,
      alt: "Our cake",
      role: "gallery",
      treatment: "none",
      provenance: {
        sourceType: "owner-supplied",
        reviewStatus: "owner-approved",
      },
    };
    expect(
      (await galleryEdit(a, o, site.id, versionId, { media: owner })).status,
    ).toBeGreaterThanOrEqual(400); // not an upload of this site
    await a.sql`INSERT INTO owner_media(id,site_id,org_id,kind,role,sha256,width,height,quality,provenance,v1280,thumb) VALUES(${crypto.randomUUID()},${site.id},${o.orgId},'photo','gallery',${sha},1280,853,${a.sql.json({ score: 80, flags: [], heroReady: true })},${a.sql.json({ sourceType: "owner-supplied" })},${Buffer.from("x")},${Buffer.from("x")})`;
    expect(
      (await galleryEdit(a, o, site.id, versionId, { media: owner })).status,
    ).toBe(201);
    // a URL on another site's path is refused even with a real upload hash
    const foreign = {
      ...owner,
      url: `https://media.example.com/api/public/sites/${crypto.randomUUID()}/m/${sha}/w1280.webp`,
    };
    expect(
      (await galleryEdit(a, o, site.id, versionId, { media: foreign })).status,
    ).toBeGreaterThanOrEqual(400);
    const bundled = {
      url: "/_kora/media/bakery-cake-frosting.webp",
      alt: "A cake",
      role: "gallery",
      treatment: "none",
      provenance: {
        sourceType: "licensed-stock",
        provider: "Forged Photos Inc",
        reviewStatus: "owner-approved",
      },
    };
    const ok = await galleryEdit(a, o, site.id, versionId, { media: bundled });
    expect(ok.status).toBe(201);
    const v = (
      await a.call(
        "GET",
        `/api/sites/${site.id}/versions/${ok.json.data.version.id}`,
        { cookie: o.cookie },
      )
    ).json.data;
    expect(JSON.stringify(v.spec)).not.toContain("Forged Photos Inc");
  });

  it("shared limits hold across instances and for lapsed plans", async () => {
    const { o, site } = await mkSite(a, "m-abuse@example.com", "Abuse Cakes");
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const h = i % 2 ? a : b; // alternate instances: the counters live in the database, not in either process
      statuses.push(
        (
          await h.call("POST", `/api/sites/${site.id}/media/candidates`, {
            cookie: o.cookie,
            body: { intents: [`fresh ${i} ${crypto.randomUUID()}`] },
          })
        ).status,
      );
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(6);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);

    const lapsed = await mkSite(a, "m-lapsed@example.com", "Lapsed Cakes");
    await a.sql`UPDATE subscriptions SET state='EXPIRED' WHERE org_id=${lapsed.o.orgId}`;
    expect(
      (
        await a.call("POST", `/api/sites/${lapsed.site.id}/media/candidates`, {
          cookie: lapsed.o.cookie,
          body: {},
        })
      ).status,
    ).toBe(402);
    expect(
      (
        await a.call("POST", `/api/sites/${lapsed.site.id}/media/select`, {
          cookie: lapsed.o.cookie,
          body: { candidateToken: "v1.x.y" },
        })
      ).status,
    ).toBe(402);
  });

  it("tenant isolation: another account cannot search, select or place against this site", async () => {
    const x = await mkSite(a, "m-iso-a@example.com", "Iso A");
    const y = await a.signup("m-iso-b@example.com");
    expect(
      (
        await a.call("POST", `/api/sites/${x.site.id}/media/candidates`, {
          cookie: y.cookie,
          body: {},
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await a.call("POST", `/api/sites/${x.site.id}/media/select`, {
          cookie: y.cookie,
          body: { candidateToken: "v1.a.b" },
        })
      ).status,
    ).toBe(404);
  });

  it("without a signing secret the suggestions are off, honestly, and nothing is signed", async () => {
    const h = await startHarness({
      env: { ...env(fake.url), KORA_SECRETS_KEY: "" },
    });
    try {
      const { o, site } = await mkSite(h, "m-nokey@example.com", "No Key");
      const r = await h.call("POST", `/api/sites/${site.id}/media/candidates`, {
        cookie: o.cookie,
        body: {},
      });
      expect(r.status).toBe(503);
      expect(
        (await h.call("GET", "/api/media/providers", { cookie: o.cookie })).json
          .data.signing,
      ).toBe("NOT_CONFIGURED");
    } finally {
      await h.close();
    }
  });

  it("the hourly provider allowance is shared across counters: 80 concurrent spends admit exactly 40", async () => {
    const q1 = new PostgresQuota(a.sql);
    const q2 = new PostgresQuota(b.sql);
    const now = Date.now() + 9 * 3_600_000;
    const r = await Promise.all(
      Array.from({ length: 80 }, (_, i) =>
        (i % 2 ? q1 : q2).tryConsume("unsplash", 50, 10, now),
      ),
    );
    expect(r.filter((x) => x.allowed)).toHaveLength(40);
  });
});

d("owner confirmations are server records, not a flag the client sets", () => {
  it("a claim-like wording is refused until the owner confirms exactly that text; the confirmation is audited and append-only", async () => {
    const { o, site, versionId } = await mkSite(
      a,
      "m-confirm@example.com",
      "Confirm Bakes",
    );
    const v = (
      await a.call("GET", `/api/sites/${site.id}/versions/${versionId}`, {
        cookie: o.cookie,
      })
    ).json.data;
    const aboutIdx = v.spec.pages
      .find((p: { slug: string }) => p.slug === "about")
      .sections.findIndex((s: { type: string }) => s.type === "story");
    const claim = "Award-winning bakers, guaranteed.";
    const edit = (extra = {}) =>
      a.call("POST", `/api/sites/${site.id}/edit`, {
        cookie: o.cookie,
        body: {
          baseVersionId: versionId,
          designEdit: {
            kind: "section-text",
            page: "about",
            index: aboutIdx,
            body: [claim],
            ...extra,
          },
        },
      });
    expect((await edit()).status).toBeGreaterThanOrEqual(400);
    expect((await edit({ author: "owner" })).status).toBeGreaterThanOrEqual(
      400,
    ); // a client-side assertion changes nothing
    const conf = await a.call("POST", `/api/sites/${site.id}/confirmations`, {
      cookie: o.cookie,
      body: { text: claim },
    });
    expect(conf.status).toBe(200);
    expect(conf.json.data.created).toBe(true);
    expect(
      (
        await a.call("POST", `/api/sites/${site.id}/confirmations`, {
          cookie: o.cookie,
          body: { text: claim },
        })
      ).json.data.created,
    ).toBe(false);
    expect((await edit()).status).toBe(201);
    expect(
      (
        await edit({
          body: ["Award-winning bakers, guaranteed, for 20 years."],
        })
      ).status,
    ).toBeGreaterThanOrEqual(400); // different text, not covered
    const audit = (
      await a.call("GET", `/api/orgs/${o.orgId}/audit`, { cookie: o.cookie })
    ).json.data;
    expect(
      audit.filter(
        (x: { action: string }) => x.action === "site.fact_confirmed",
      ),
    ).toHaveLength(1);
    await expect(
      a.sql`UPDATE owner_confirmations SET text='changed' WHERE site_id=${site.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      a.sql`DELETE FROM owner_confirmations WHERE site_id=${site.id}`,
    ).rejects.toThrow(/append-only/);
    // another account's site cannot be confirmed into
    const intruder = await a.signup("m-confirm-x@example.com");
    expect(
      (
        await a.call("POST", `/api/sites/${site.id}/confirmations`, {
          cookie: intruder.cookie,
          body: { text: "x" },
        })
      ).status,
    ).toBe(404);
  });
});
