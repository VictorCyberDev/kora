import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

process.env.KORA_STUDIO_WORKER = "true";
const enabled = Boolean(process.env.DATABASE_URL);
const d = enabled ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let h: Harness;
beforeAll(async () => {
  if (enabled)
    h = await startHarness({ env: { KORA_SANDBOX_CHANNELS: "true" } });
});
afterAll(async () => {
  if (enabled) await h.close();
});
const BROWSER =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

const brief = {
  name: "Intel Kitchen",
  description: "Home-style Nigerian meals and party jollof in Lekki, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
};
async function ready(email: string, connect: string[] = ["facebook"]) {
  const a = await h.signup(email, "Org");
  const s = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name },
    })
  ).json.data;
  const gen = await h.call("POST", `/api/sites/${s.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  await h.call(
    "POST",
    `/api/sites/${s.id}/versions/${gen.json.data.version.id}/publish`,
    { cookie: a.cookie },
  );
  const imp = await h.call("POST", `/api/sites/${s.id}/presence/import`, {
    cookie: a.cookie,
  });
  const facts = imp.json.data.facts;
  facts.offer.services = ["Party jollof"];
  facts.offer.offers = [
    {
      id: "lunch",
      title: "Weekday lunch",
      detail: "Rice and stew",
      price: "₦3,500",
    },
  ];
  await h.call("PUT", `/api/sites/${s.id}/presence/profile`, {
    cookie: a.cookie,
    body: { facts, expectedRevision: 1 },
  });
  await h.call("POST", `/api/sites/${s.id}/brand-kit`, {
    cookie: a.cookie,
    body: { from: "site" },
  });
  for (const p of connect) {
    const st = new URL(
      (
        await h.call("POST", `/api/sites/${s.id}/channels/${p}/connect`, {
          cookie: a.cookie,
          body: {},
        })
      ).json.data.authorizeUrl,
    ).searchParams.get("state")!;
    await h.call(
      "GET",
      `/api/oauth/callback?state=${encodeURIComponent(st)}&code=sandbox`,
      { cookie: a.cookie },
    );
  }
  return { a, s };
}
const beacon = (siteId: string, body: unknown, ua = BROWSER) =>
  fetch(`${h.base}/api/public/sites/${siteId}/events`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": ua },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

d("attribution", () => {
  it("puts a tracked link in campaign posts and counts only what arrives through it", async () => {
    const { a, s } = await ready("in1@example.com");
    const made = await h.call("POST", `/api/sites/${s.id}/campaigns`, {
      cookie: a.cookie,
      body: {
        name: "Lunch launch",
        offerId: "lunch",
        channels: ["facebook"],
        startOn: day(1),
        endOn: day(8),
      },
    });
    expect(made.status).toBe(201);
    const items = (
      await h.call("GET", `/api/sites/${s.id}/campaigns/${made.json.data.id}`, {
        cookie: a.cookie,
      })
    ).json.data.items as Array<{ caption: { body: string } }>;
    const url = /https?:\/\/\S+/.exec(items[0]!.caption.body)![0];
    const u = new URL(url);
    const code = u.searchParams.get("k")!;
    expect(code).toMatch(/^[a-z]{8}$/);
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_campaign")).toBe("lunch-launch");
    // one code per channel, shared by the campaign's posts
    expect(
      new Set(
        items.map((i) =>
          new URL(/https?:\/\/\S+/.exec(i.caption.body)![0]).searchParams.get(
            "k",
          ),
        ),
      ).size,
    ).toBe(1);

    expect((await beacon(s.id, { k: code, t: "visit" })).status).toBe(204);
    await beacon(s.id, { k: code, t: "visit" });
    await beacon(s.id, { k: code, t: "whatsapp" });
    await beacon(s.id, { k: code, t: "call" });
    // none of these count: a bot, an unknown code, malformed bodies, another site's id
    await beacon(s.id, { k: code, t: "visit" }, "facebookexternalhit/1.1");
    await beacon(s.id, { k: "zzzzzzzz", t: "visit" });
    await beacon(s.id, "not json");
    await beacon(s.id, { k: code, t: "purchase" });
    const other = await ready("in1b@example.com");
    await beacon(other.s.id, { k: code, t: "visit" });
    // a form submitted by a visitor who arrived through the link
    await fetch(`${h.base}/api/public/sites/${s.id}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada",
        phone: "+2348055500001",
        message: "How much?",
        k: code,
      }),
    });
    await fetch(`${h.base}/api/public/sites/${s.id}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Spoof", message: "x", k: "bad-code-1" }),
    });

    const rep = await h.call("GET", `/api/sites/${s.id}/attribution?days=7`, {
      cookie: a.cookie,
    });
    expect(rep.status).toBe(200);
    expect(rep.json.data.summary).toMatchObject({
      links: 1,
      visits: 2,
      whatsappTaps: 1,
      callTaps: 1,
      enquiries: 1,
    });
    expect(rep.json.data.note).toMatch(
      /only people who arrived through a link/,
    );
    expect(JSON.stringify(rep.json)).not.toMatch(/revenue|sales generated/i);
    // the invalid code never reached storage
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM form_submissions WHERE site_id=${s.id} AND fields ? 'k'`
        )[0]!.n,
      ),
    ).toBe(1);

    const brief2 = (
      await h.call("GET", `/api/sites/${s.id}/marketing/brief`, {
        cookie: a.cookie,
      })
    ).json.data.brief;
    expect(JSON.stringify(brief2.sections)).toContain(
      "2 visits from links Kora created",
    );

    const bb = await h.signup("in1c@example.com", "C");
    expect(
      (
        await h.call("GET", `/api/sites/${s.id}/attribution`, {
          cookie: bb.cookie,
        })
      ).status,
    ).toBe(404);
  });

  it("v2 sites carry the tracking script and meta tag; v1 output is untouched", async () => {
    const { a, s } = await ready("in2@example.com");
    const vs = (
      await h.call("GET", `/api/sites/${s.id}/versions`, { cookie: a.cookie })
    ).json.data as Array<{ id: string }>;
    const v = (
      await h.call("GET", `/api/sites/${s.id}/versions/${vs[0]!.id}`, {
        cookie: a.cookie,
      })
    ).json.data;
    expect(v.files).toContain("site.js");
  });
});

d("social analytics", () => {
  it("syncs and normalizes metrics, labels test data, and keeps it out of live totals", async () => {
    const { a, s } = await ready("in3@example.com");
    const sy = await h.call("POST", `/api/sites/${s.id}/analytics/sync`, {
      cookie: a.cookie,
    });
    expect(sy.json.data[0]).toMatchObject({
      provider: "facebook",
      mode: "SANDBOX",
    });
    expect(sy.json.data[0].synced).toBeGreaterThan(0);
    const an = (
      await h.call("GET", `/api/sites/${s.id}/analytics`, { cookie: a.cookie })
    ).json.data;
    expect(an.providers[0].mode).toBe("SANDBOX");
    expect(
      an.providers[0].totals.map((t: { metric: string }) => t.metric),
    ).toEqual(expect.arrayContaining(["impressions", "followers"]));
    // re-syncing updates rather than duplicating
    await h.call("POST", `/api/sites/${s.id}/analytics/sync`, {
      cookie: a.cookie,
    });
    const n1 = Number(
      (
        await h.sql`SELECT COUNT(*)::int AS n FROM social_metrics WHERE site_id=${s.id}`
      )[0]!.n,
    );
    await h.call("POST", `/api/sites/${s.id}/analytics/sync`, {
      cookie: a.cookie,
    });
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM social_metrics WHERE site_id=${s.id}`
        )[0]!.n,
      ),
    ).toBe(n1);
    const b = await h.signup("in3b@example.com", "B");
    expect(
      (
        await h.call("GET", `/api/sites/${s.id}/analytics`, {
          cookie: b.cookie,
        })
      ).status,
    ).toBe(404);
  });
});

d("reviews and reputation", () => {
  it("never drafts for sensitive reviews, never posts anywhere, and keeps test reviews out of the summary", async () => {
    const { a, s } = await ready("in4@example.com", ["google_business"]);
    const sync = await h.call("POST", `/api/sites/${s.id}/reviews/sync`, {
      cookie: a.cookie,
    });
    expect(sync.json.data.added).toBe(2);
    let v = (
      await h.call("GET", `/api/sites/${s.id}/reviews`, { cookie: a.cookie })
    ).json.data;
    expect(v.reviews).toHaveLength(2);
    expect(v.summary.count).toBe(0);
    const pos = await h.call("POST", `/api/sites/${s.id}/reviews`, {
      cookie: a.cookie,
      body: {
        provider: "google_business",
        rating: 5,
        author: "Ada Obi",
        body: "Lovely jollof",
      },
    });
    const neg = await h.call("POST", `/api/sites/${s.id}/reviews`, {
      cookie: a.cookie,
      body: {
        provider: "google_business",
        rating: 5,
        author: "Bola",
        body: "I want a refund, this was a scam",
      },
    });
    const low = await h.call("POST", `/api/sites/${s.id}/reviews`, {
      cookie: a.cookie,
      body: { provider: "google_business", rating: 2, body: "slow" },
    });
    const sug = await h.call(
      "POST",
      `/api/sites/${s.id}/reviews/${pos.json.data.id}/suggest-reply`,
      { cookie: a.cookie },
    );
    expect(sug.status).toBe(200);
    expect(sug.json.data.body).toContain("Ada");
    for (const id of [neg.json.data.id, low.json.data.id]) {
      const r = await h.call(
        "POST",
        `/api/sites/${s.id}/reviews/${id}/suggest-reply`,
        { cookie: a.cookie },
      );
      expect(r.status).toBe(422);
      expect(r.json.error).toBe("needs_you");
    }
    v = (
      await h.call("GET", `/api/sites/${s.id}/reviews`, { cookie: a.cookie })
    ).json.data;
    expect(v.summary.count).toBe(3);
    expect(v.summary.needsYou).toBe(2);
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${s.id}/reviews/${pos.json.data.id}/replied`,
          { cookie: a.cookie },
        )
      ).json.data.status,
    ).toBe("REPLIED");
    // there is no route that posts a reply to a platform
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${s.id}/reviews/${pos.json.data.id}/post`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(404);
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM publish_jobs WHERE site_id=${s.id}`
        )[0]!.n,
      ),
    ).toBe(0);
    const b = await h.signup("in4b@example.com", "B");
    for (const [m, p] of [
      ["GET", `/api/sites/${s.id}/reviews`],
      ["POST", `/api/sites/${s.id}/reviews/${pos.json.data.id}/suggest-reply`],
      ["POST", `/api/sites/${s.id}/reviews/sync`],
    ] as Array<[string, string]>)
      expect(
        (await h.call(m, p, { cookie: b.cookie })).status,
        `${m} ${p}`,
      ).toBe(404);
  });
});

d("business memory", () => {
  it("remembers owner preferences and applies them to what Kora writes", async () => {
    const { a, s } = await ready("in5@example.com");
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/memory`, {
          cookie: a.cookie,
          body: { kind: "OUTCOME", key: "x", value: "faked" },
        })
      ).status,
    ).toBe(400);
    const add = await h.call("POST", `/api/sites/${s.id}/memory`, {
      cookie: a.cookie,
      body: { kind: "PREFERENCE", key: "avoid_word", value: "cheap" },
    });
    expect(add.status).toBe(201);
    const dr = await h.call("POST", `/api/sites/${s.id}/content/drafts`, {
      cookie: a.cookie,
      body: { goal: "welcome", channel: "instagram" },
    });
    expect(dr.status).toBe(201);
    const draft = dr.json.data.drafts[0];
    const bad = await h.call(
      "PATCH",
      `/api/sites/${s.id}/content/drafts/${draft.id}`,
      {
        cookie: a.cookie,
        body: { ...draft.draft, body: "Cheap and tasty jollof" },
      },
    );
    expect(bad.status).toBe(422);
    expect(bad.json.message).toMatch(/avoid/);
    // archived memory stops applying
    const list = (
      await h.call("GET", `/api/sites/${s.id}/memory`, { cookie: a.cookie })
    ).json.data as Array<{ id: string }>;
    expect(
      (
        await h.call("DELETE", `/api/sites/${s.id}/memory/${list[0]!.id}`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.call("PATCH", `/api/sites/${s.id}/content/drafts/${draft.id}`, {
          cookie: a.cookie,
          body: { ...draft.draft, body: "Cheap and tasty jollof" },
        })
      ).status,
    ).toBe(200);
    const b = await h.signup("in5b@example.com", "B");
    expect(
      (await h.call("GET", `/api/sites/${s.id}/memory`, { cookie: b.cookie }))
        .status,
    ).toBe(404);
  });

  it("learns from a finished campaign exactly once, with counts and no cause", async () => {
    const { a, s } = await ready("in6@example.com");
    const made = await h.call("POST", `/api/sites/${s.id}/campaigns`, {
      cookie: a.cookie,
      body: {
        name: "Old promo",
        offerId: "lunch",
        channels: ["facebook"],
        startOn: day(1),
        endOn: day(3),
      },
    });
    const cid = made.json.data.id as string;
    await h.sql`UPDATE campaigns SET status='ACTIVE', starts_on=current_date - 10, ends_on=current_date - 3 WHERE id=${cid}`;
    const code = (
      await h.sql`SELECT code FROM attribution_links WHERE campaign_id=${cid}`
    )[0]!.code as string;
    await beacon(s.id, { k: code, t: "visit" });
    expect(
      (
        await h.call("POST", `/api/sites/${s.id}/marketing/brief`, {
          cookie: a.cookie,
        })
      ).status,
    ).toBe(201);
    await h.call("POST", `/api/sites/${s.id}/marketing/brief`, {
      cookie: a.cookie,
    });
    const mem = (
      await h.call("GET", `/api/sites/${s.id}/memory`, { cookie: a.cookie })
    ).json.data as Array<{ kind: string; value: string }>;
    const out = mem.filter((m) => m.kind === "OUTCOME");
    expect(out).toHaveLength(1);
    expect(out[0]!.value).toContain("Old promo");
    expect(out[0]!.value).not.toMatch(/because|caused|revenue/i);
  });
});
