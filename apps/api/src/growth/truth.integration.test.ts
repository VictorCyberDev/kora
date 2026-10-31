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
  name: "Ada Cakes",
  description:
    "Birthday cakes, cupcakes and sourdough bread baked to order in Yaba, Lagos.",
  whatsapp: "+2348012345678",
  hours: [{ days: "Mon-Sat", hours: "9am-8pm" }],
  services: ["Birthday cakes", "Cupcakes"],
};

async function setup(email: string) {
  const a = await h.signup(email, "Org");
  const site = (
    await h.call("POST", "/api/sites", {
      cookie: a.cookie,
      body: { orgId: a.orgId, name: brief.name, description: "x" },
    })
  ).json.data;
  await h.call("POST", `/api/sites/${site.id}/generate`, {
    cookie: a.cookie,
    body: brief,
  });
  return { a, site };
}

d("truth engine and brand genome over the API", () => {
  it("checks claims against owner facts, stores an append-only ledger", async () => {
    const { a, site } = await setup("truth1@example.com");
    const noProfile = await h.call(
      "POST",
      `/api/sites/${site.id}/truth/check`,
      {
        cookie: a.cookie,
        body: {
          subject: "post",
          claims: [{ kind: "hours", key: "hours" }],
        },
      },
    );
    expect(noProfile.status).toBe(409);
    await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    const r = await h.call("POST", `/api/sites/${site.id}/truth/check`, {
      cookie: a.cookie,
      body: {
        subject: "Saturday post",
        claims: [
          { kind: "hours", key: "hours" },
          { kind: "testimonial", key: "t1", text: "Best cake in Lagos" },
          { kind: "price", key: "price:birthday-cake", text: "birthday cake" },
        ],
      },
    });
    expect(r.status).toBe(201);
    expect(r.json.data.publishable).toBe(false);
    expect(r.json.data.used).toHaveLength(1);
    expect(
      r.json.data.blocked.map((b: { reason: string }) => b.reason),
    ).toEqual(["MISSING", "MISSING"]);
    expect(r.json.data.questions).toHaveLength(2);
    const t = await h.call("GET", `/api/sites/${site.id}/truth`, {
      cookie: a.cookie,
    });
    expect(t.json.data.ledgers).toHaveLength(1);
    expect(t.json.data.facts.length).toBeGreaterThan(0);
    const bad = await h.call("POST", `/api/sites/${site.id}/truth/check`, {
      cookie: a.cookie,
      body: { subject: "x", claims: [{ kind: "nonsense", key: "k" }] },
    });
    expect(bad.status).toBe(400);
    await expect(
      h.sql`UPDATE claim_ledgers SET subject='tampered' WHERE site_id=${site.id}`,
    ).rejects.toThrow(/append-only/);
  });

  it("builds a versioned brand genome that keeps owner strategy and asks for the rest", async () => {
    const { a, site } = await setup("genome1@example.com");
    const early = await h.call("POST", `/api/sites/${site.id}/genome`, {
      cookie: a.cookie,
      body: {},
    });
    expect(early.status).toBe(409);
    await h.call("POST", `/api/sites/${site.id}/presence/import`, {
      cookie: a.cookie,
    });
    await h.call("POST", `/api/sites/${site.id}/brand-kit`, {
      cookie: a.cookie,
      body: { from: "site" },
    });
    const v1 = await h.call("POST", `/api/sites/${site.id}/genome`, {
      cookie: a.cookie,
      body: {},
    });
    expect(v1.status).toBe(201);
    expect(v1.json.data.current.version).toBe(1);
    expect(v1.json.data.gaps.length).toBeGreaterThan(0);
    const v2 = await h.call("POST", `/api/sites/${site.id}/genome`, {
      cookie: a.cookie,
      body: { positioning: "Cakes baked to order, never stocked." },
    });
    expect(v2.json.data.current.version).toBe(2);
    const v3 = await h.call("POST", `/api/sites/${site.id}/genome`, {
      cookie: a.cookie,
      body: {},
    });
    expect(v3.json.data.current.strategic.positioning).toBe(
      "Cakes baked to order, never stocked.",
    );
    const other = await h.signup("genome-other@example.com", "Other");
    const denied = await h.call("GET", `/api/sites/${site.id}/genome`, {
      cookie: other.cookie,
    });
    expect(denied.status).toBeGreaterThanOrEqual(403);
  });
});
