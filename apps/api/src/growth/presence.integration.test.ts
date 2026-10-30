import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;

let h: Harness;
beforeAll(async () => {
  if (enabled) h = await startHarness();
});
afterAll(async () => {
  if (enabled) await h.close();
});

const brief = {
  name: "Mama Ngozi Kitchen",
  description:
    "Home-style Nigerian meals, catering and party jollof in Lekki, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
};

async function siteWithVersion(email: string) {
  const a = await h.signup(email, "Org");
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name, description: "x" },
    })
  ).json.data;
  const gen = await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  expect(gen.status).toBe(201);
  return { a, site, versionId: gen.json.data.version.id as string };
}

d("presence graph and health", () => {
  it("imports facts, tracks revisions, detects drift and applies as a draft only", async () => {
    const { a, site, versionId } = await siteWithVersion("p1@example.com");
    const empty = await h.call("GET", `/api/sites/${site.id}/presence`, {
      cookie: a.cookie,
    });
    expect(empty.json.data.profile).toBeNull();
    expect(empty.json.data.importable).toBe(true);

    const imp = await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    expect(imp.status).toBe(201);
    expect(imp.json.data.facts.contact.whatsapp).toBe("+2348012345678");
    expect(
      (
        await h.call("POST", `/api/sites/${site.id}/presence/import`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(409);

    // Publish, then change a fact in the profile only: the website must now disagree.
    const pub = await h.call(
      "POST",
      `/api/sites/${site.id}/versions/${versionId}/publish`,
      { cookie: a.cookie },
    );
    expect(pub.status).toBe(200);
    const facts = imp.json.data.facts;
    facts.contact.phone = "+2348099999999";
    const put = await h.call("PUT", `/api/sites/${site.id}/presence/profile`, {
      cookie: a.cookie,
      body: { facts, expectedRevision: 1 },
    });
    expect(put.status).toBe(200);
    expect(put.json.data.revision).toBe(2);

    // Stale revision is refused rather than overwriting.
    const stale = await h.call(
      "PUT",
      `/api/sites/${site.id}/presence/profile`,
      {
        cookie: a.cookie,
        body: { facts, expectedRevision: 1 },
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.json.error).toBe("revision_conflict");

    const view = await h.call("GET", `/api/sites/${site.id}/presence`, {
      cookie: a.cookie,
    });
    const drift = view.json.data.health.checks.find(
      (c: { id: string }) => c.id === "website.drift",
    );
    expect(drift.status).toBe("WARN");
    expect(drift.observed).toContain("phone");
    expect(view.json.data.health).not.toHaveProperty("score");

    const checked = await h.call(
      "POST",
      `/api/sites/${site.id}/presence/check`,
      { cookie: a.cookie },
    );
    expect(checked.status).toBe(200);
    expect(checked.json.data.counts.WARN).toBeGreaterThan(0);

    const before = (
      await h.call("GET", `/api/sites/${site.id}`, { cookie: a.cookie })
    ).json.data;
    const applied = await h.call(
      "POST",
      `/api/sites/${site.id}/presence/apply`,
      { cookie: a.cookie },
    );
    expect(applied.status).toBe(201);
    const after = (
      await h.call("GET", `/api/sites/${site.id}`, { cookie: a.cookie })
    ).json.data;
    // A new version exists but the live site did not move.
    expect(after.publishedVersionId).toBe(before.publishedVersionId);
    expect(applied.json.data.version.id).not.toBe(versionId);

    const audit = (
      await h.call("GET", `/api/orgs/${a.orgId}/audit`, { cookie: a.cookie })
    ).json.data as Array<{ action: string }>;
    expect(audit.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        "presence.profile_imported",
        "presence.profile_updated",
        "presence.checked",
        "presence.applied_to_site",
      ]),
    );
  });

  it("never lets another organization read or change a profile", async () => {
    const { a, site } = await siteWithVersion("p2@example.com");
    await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    const b = await h.signup("p2b@example.com", "Other");
    for (const [m, p, body] of [
      ["GET", `/api/sites/${site.id}/presence`],
      ["POST", `/api/sites/${site.id}/presence/import`],
      [
        "PUT",
        `/api/sites/${site.id}/presence/profile`,
        { facts: {}, expectedRevision: 1 },
      ],
      ["POST", `/api/sites/${site.id}/presence/check`],
      ["POST", `/api/sites/${site.id}/presence/apply`],
      ["GET", `/api/sites/${site.id}/brand-kit`],
      ["POST", `/api/sites/${site.id}/brand-kit`, { from: "site" }],
      ["GET", `/api/orgs/${a.orgId}/features`],
    ] as Array<[string, string, unknown?]>) {
      const r = await h.call(m, p, {
        cookie: b.cookie,
        ...(body ? { body } : {}),
      });
      expect(r.status, `${m} ${p}`).toBe(404);
    }
  });

  it("rejects unknown fields, bad contact data and unauthenticated calls", async () => {
    const { a, site } = await siteWithVersion("p3@example.com");
    const imp = await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    const facts = imp.json.data.facts;
    const bad = await h.call("PUT", `/api/sites/${site.id}/presence/profile`, {
      cookie: a.cookie,
      body: {
        facts: { ...facts, contact: { phone: "<script>" } },
        expectedRevision: 1,
      },
    });
    expect(bad.status).toBe(400);
    const extra = await h.call(
      "PUT",
      `/api/sites/${site.id}/presence/profile`,
      {
        cookie: a.cookie,
        body: { facts, expectedRevision: 1, orgId: "x" },
      },
    );
    expect(extra.status).toBe(400);
    expect((await h.call("GET", `/api/sites/${site.id}/presence`)).status).toBe(
      401,
    );
  });
});

d("brand kit", () => {
  it("derives from the site, versions on every change and refuses illegible colours", async () => {
    const { a, site } = await siteWithVersion("b1@example.com");
    const empty = await h.call("GET", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
    });
    expect(empty.json.data.current).toBeNull();
    expect(empty.json.data.suggestion.colors.primary).toMatch(
      /^#[0-9a-f]{6}$/i,
    );

    const v1 = await h.call("POST", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
      body: { from: "site" },
    });
    expect(v1.status).toBe(201);
    expect(v1.json.data.version).toBe(1);
    const kit = structuredClone(v1.json.data.kit);
    kit.voice.tone = "playful";
    const v2 = await h.call("POST", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
      body: { kit },
    });
    expect(v2.json.data.version).toBe(2);

    const bad = structuredClone(kit);
    bad.colors.primaryText = bad.colors.primary;
    const rej = await h.call("POST", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
      body: { kit: bad },
    });
    expect(rej.status).toBe(422);

    const list = await h.call("GET", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
    });
    expect(
      list.json.data.versions.map((x: { version: number }) => x.version),
    ).toEqual([2, 1]);
    // Version 1 is preserved exactly: changing the kit never rewrites history.
    expect(list.json.data.versions[1].kit.voice.tone).not.toBe("playful");
    await expect(
      h.sql`UPDATE brand_kits SET kit='{}'::jsonb WHERE site_id=${site.id}`,
    ).rejects.toThrow(/append-only/);
  });
});

d("feature entitlements", () => {
  it("reports the tier and which features it includes", async () => {
    const a = await h.signup("f1@example.com", "Org");
    const r = await h.call("GET", `/api/orgs/${a.orgId}/features`, {
      cookie: a.cookie,
    });
    expect(r.status).toBe(200);
    expect(r.json.data.tier).toBe("TRIAL");
    expect(r.json.data.features["presence.graph"]).toBe(true);
    expect(r.json.data.features["marketing.agent"]).toBe(false);
  });
  it("blocks growth writes once the plan has ended, while reads keep working", async () => {
    const { a, site } = await siteWithVersion("f2@example.com");
    await h.sql`UPDATE subscriptions SET state='EXPIRED', current_period_end=now() - interval '60 days' WHERE org_id=${a.orgId}`;
    const imp = await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    expect(imp.status).toBe(402);
    expect(
      (
        await h.call("GET", `/api/sites/${site.id}/presence`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(200);
  });
});
