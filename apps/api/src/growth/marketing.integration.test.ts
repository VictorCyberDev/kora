import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  startHarness,
  type Harness,
} from "../test-support/platform-harness.js";

process.env.KORA_STUDIO_WORKER = "true";
process.env.KORA_PUBLISH_TICK_MS = "400";
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

const brief = {
  name: "Mkt Kitchen",
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
    { id: "eid", title: "Eid platter", detail: "", endsOn: "2020-01-01" },
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

d("marketing agent", () => {
  it("makes evidenced suggestions, executes only safe ones, and records the policy", async () => {
    const { a, s } = await ready("mk1@example.com");
    // a customer writes in, so replying must outrank posting
    await fetch(`${h.base}/api/public/sites/${s.id}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Ada",
        phone: "+2348055500001",
        message: "Price for 20 trays?",
      }),
    });
    const r = await h.call("POST", `/api/sites/${s.id}/marketing/refresh`, {
      cookie: a.cookie,
    });
    expect(r.status).toBe(200);
    const recs = r.json.data as Array<{
      id: string;
      rec: {
        rule: string;
        policy: { authority: string };
        action: { type: string };
        hypothesis: string;
      };
      evidence: unknown[];
    }>;
    expect(recs[0]!.rec.rule).toBe("customers_waiting");
    expect(recs[0]!.rec.policy.authority).toBe("DENY");
    for (const x of recs) {
      expect(x.evidence.length).toBeGreaterThan(0);
      expect(x.rec.hypothesis).toBeTruthy();
    }
    expect(recs.some((x) => x.rec.rule === "expired_offer")).toBe(true);
    const promo = recs.find((x) => x.rec.rule === "offer_not_promoted")!;
    expect(promo).toBeTruthy();
    // refreshing again does not duplicate
    const again = (
      await h.call("POST", `/api/sites/${s.id}/marketing/refresh`, {
        cookie: a.cookie,
      })
    ).json.data as unknown[];
    expect(again.length).toBe(recs.length);

    // Accepting "reply" executes nothing: it only points at Customers
    const reply = await h.call(
      "POST",
      `/api/sites/${s.id}/marketing/recommendations/${recs[0]!.id}/accept`,
      { cookie: a.cookie },
    );
    expect(reply.json.data.result).toEqual({ navigate: "customers" });
    // Accepting the promotion creates a DRAFT only; nothing is published or scheduled
    const acc = await h.call(
      "POST",
      `/api/sites/${s.id}/marketing/recommendations/${promo.id}/accept`,
      { cookie: a.cookie },
    );
    expect(acc.status).toBe(200);
    const itemId = acc.json.data.result.calendarItemId as string;
    const item = (
      await h.call("GET", `/api/sites/${s.id}/calendar/items/${itemId}`, {
        cookie: a.cookie,
      })
    ).json.data.item;
    expect(item.state).toBe("DRAFT");
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM publish_jobs WHERE site_id=${s.id}`
        )[0]!.n,
      ),
    ).toBe(0);
    expect(
      (
        await h.call(
          "POST",
          `/api/sites/${s.id}/marketing/recommendations/${promo.id}/accept`,
          { cookie: a.cookie },
        )
      ).status,
    ).toBe(409);
    const audit = (
      await h.call("GET", `/api/orgs/${a.orgId}/audit`, { cookie: a.cookie })
    ).json.data as Array<{
      action: string;
      metadata: { policy?: { authority: string } };
    }>;
    const exec = audit.find(
      (x) =>
        x.action === "agent.action_executed" &&
        x.metadata.policy?.authority === "AUTO_SAFE",
    );
    expect(exec).toBeTruthy();

    // dismissing snoozes: it does not come back on the next refresh
    const quiet = recs.find((x) => x.rec.rule === "expired_offer")!;
    await h.call(
      "POST",
      `/api/sites/${s.id}/marketing/recommendations/${quiet.id}/dismiss`,
      { cookie: a.cookie },
    );
    const after = (
      await h.call("POST", `/api/sites/${s.id}/marketing/refresh`, {
        cookie: a.cookie,
      })
    ).json.data as Array<{ id: string }>;
    expect(after.some((x) => x.id === quiet.id)).toBe(false);

    const b = await h.signup("mk1b@example.com", "B");
    for (const [m, p] of [
      ["POST", `/api/sites/${s.id}/marketing/refresh`],
      ["GET", `/api/sites/${s.id}/marketing/recommendations`],
      [
        "POST",
        `/api/sites/${s.id}/marketing/recommendations/${promo.id}/accept`,
      ],
      ["GET", `/api/sites/${s.id}/marketing/brief`],
    ] as Array<[string, string]>)
      expect(
        (await h.call(m, p, { cookie: b.cookie })).status,
        `${m} ${p}`,
      ).toBe(404);
  });
});

d("growth brief", () => {
  it("reports measured numbers, lists what is unavailable, and freezes a snapshot", async () => {
    const { a, s } = await ready("mk2@example.com");
    await fetch(`${h.base}/api/public/sites/${s.id}/forms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Bola",
        phone: "+2348055500002",
        message: "Hello",
      }),
    });
    await h.call("GET", `/api/sites/${s.id}/leads`, { cookie: a.cookie });
    const r = await h.call("GET", `/api/sites/${s.id}/marketing/brief`, {
      cookie: a.cookie,
    });
    expect(r.status).toBe(200);
    const b = r.json.data.brief;
    expect(b.sections[0].items[0].value).toBe("1");
    expect(
      b.unavailable.map((x: { topic: string }) => x.topic).join("|"),
    ).toMatch(/revenue/);
    expect(JSON.stringify(b)).not.toMatch(
      /reach of|impressions|visitors this week/i,
    );
    const saved = await h.call("POST", `/api/sites/${s.id}/marketing/brief`, {
      cookie: a.cookie,
    });
    expect(saved.status).toBe(201);
    await expect(
      h.sql`UPDATE growth_briefs SET brief='{}'::jsonb WHERE site_id=${s.id}`,
    ).rejects.toThrow(/append-only/);
  });
});

d("campaign bundles", () => {
  it("builds a branded multi-channel bundle that needs approval, then schedules only what can be posted", async () => {
    const { a, s } = await ready("mk3@example.com");
    const day = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const body = {
      name: "Lunch launch",
      offerId: "lunch",
      channels: ["facebook", "whatsapp"],
      startOn: day(1),
      endOn: day(8),
    };
    const bad = await h.call("POST", `/api/sites/${s.id}/campaigns`, {
      cookie: a.cookie,
      body: { ...body, offerId: "eid" },
    });
    expect(bad.status).toBe(422);
    expect(bad.json.error).toBe("offer_not_active");
    const made = await h.call("POST", `/api/sites/${s.id}/campaigns`, {
      cookie: a.cookie,
      body,
    });
    expect(made.status).toBe(201);
    expect(made.json.data.posts).toBe(6);
    const cid = made.json.data.id as string;
    const detail = (
      await h.call("GET", `/api/sites/${s.id}/campaigns/${cid}`, {
        cookie: a.cookie,
      })
    ).json.data;
    expect(detail.items).toHaveLength(6);
    expect(
      detail.items.every(
        (i: { state: string; assetId: string }) =>
          i.state === "APPROVAL_NEEDED" && i.assetId,
      ),
    ).toBe(true);
    expect(detail.campaign.needsApproval).toBe(6);
    // nothing is queued before approval
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM publish_jobs WHERE site_id=${s.id}`
        )[0]!.n,
      ),
    ).toBe(0);
    const assets = (
      await h.call("GET", `/api/sites/${s.id}/assets`, { cookie: a.cookie })
    ).json.data;
    expect(assets.length).toBe(2);
    expect(
      assets.every((x: { brandVersion: number }) => x.brandVersion === 1),
    ).toBe(true);

    const ap = await h.call(
      "POST",
      `/api/sites/${s.id}/campaigns/${cid}/approve-all`,
      { cookie: a.cookie },
    );
    expect(ap.status).toBe(200);
    expect(ap.json.data.approved).toBe(6);
    expect(ap.json.data.scheduled).toBe(3); // facebook only; WhatsApp has no posting, so those stay with the owner
    expect(ap.json.data.needsYou).toHaveLength(3);
    expect(ap.json.data.needsYou[0].reason).toMatch(/does not support posting/);
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM approvals WHERE site_id=${s.id} AND decision='APPROVED'`
        )[0]!.n,
      ),
    ).toBe(6);

    const can = await h.call(
      "POST",
      `/api/sites/${s.id}/campaigns/${cid}/cancel`,
      { cookie: a.cookie },
    );
    expect(can.json.data.cancelled).toBe(6);
    expect(
      Number(
        (
          await h.sql`SELECT COUNT(*)::int AS n FROM publish_jobs WHERE site_id=${s.id} AND state='QUEUED'`
        )[0]!.n,
      ),
    ).toBe(0);

    const b = await h.signup("mk3b@example.com", "B");
    for (const [m, p, bd] of [
      ["GET", `/api/sites/${s.id}/campaigns`],
      ["POST", `/api/sites/${s.id}/campaigns`, body],
      ["GET", `/api/sites/${s.id}/campaigns/${cid}`],
      ["POST", `/api/sites/${s.id}/campaigns/${cid}/approve-all`],
      ["POST", `/api/sites/${s.id}/campaigns/${cid}/cancel`],
    ] as Array<[string, string, unknown?]>)
      expect(
        (await h.call(m, p, { cookie: b.cookie, ...(bd ? { body: bd } : {}) }))
          .status,
        `${m} ${p}`,
      ).toBe(404);
  });
});
