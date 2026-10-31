import { describe, expect, it } from "vitest";
import {
  BusinessFactsSchema,
  brandKitIssues,
  buildPresenceGraph,
  deriveBrandKit,
  evaluatePresenceHealth,
  factsFromSpec,
  hasFeature,
  lowestTierWith,
  summarizeHealth,
  emptyFacts,
  type PresenceInputs,
} from "../src/index.js";
import { parseSiteSpec } from "@kora/site-schema";

const now = new Date("2026-06-10T12:00:00Z");
const base = (over: Partial<PresenceInputs> = {}): PresenceInputs => ({
  now,
  facts: BusinessFactsSchema.parse({
    identity: {
      name: "Mama Ngozi Kitchen",
      description:
        "Home-style Nigerian meals, catering and party jollof in Lekki.",
    },
    contact: {
      phone: "+2348012345678",
      whatsapp: "+2348012345678",
      city: "Lagos",
    },
    availability: { hours: [{ days: "Mon-Sat", hours: "9am-8pm" }] },
    offer: { services: ["Catering", "Party jollof"] },
  }),
  site: {
    exists: true,
    published: true,
    url: "https://mama.example",
    publishedAt: "2026-06-01T00:00:00Z",
    liveFacts: null,
  },
  domain: { custom: "mamangozi.com", verified: true, tls: "valid" },
  brand: null,
  channels: [],
  proof: { passports: 0, lastPassportAt: null },
  operations: {
    status: "Healthy",
    lastCheckAt: "2026-06-10T11:50:00Z",
    openIncidents: 0,
  },
  demand: { enquiries30d: 0, waiting: 0, oldestWaitingAt: null },
  ...over,
});
const byId = (cs: ReturnType<typeof evaluatePresenceHealth>, id: string) =>
  cs.find((c) => c.id === id);

describe("facts", () => {
  it("rejects malformed contact data", () => {
    expect(() =>
      BusinessFactsSchema.parse({
        identity: { name: "x" },
        contact: { phone: "<script>" },
        availability: {},
        offer: {},
      }),
    ).toThrow();
  });
  it("reads facts off a site spec without inventing any", () => {
    const spec = parseSiteSpec({
      version: 1,
      business: { name: "Acme", phone: "+234 801 234 5678" },
      brand: {},
      seo: { title: "Acme" },
      pages: [
        {
          slug: "home",
          title: "Home",
          sections: [{ type: "hero", heading: "Hi", subheading: "" }],
        },
      ],
      footer: {},
    });
    const f = factsFromSpec(spec);
    expect(f.identity.name).toBe("Acme");
    expect(f.contact.phone).toBe("+234 801 234 5678");
    expect(f.contact.whatsapp).toBeUndefined();
    expect(f.availability.hours).toEqual([]);
  });
});

describe("presence health", () => {
  it("is decomposable: every non-OK check explains itself", () => {
    const cs = evaluatePresenceHealth(base());
    for (const c of cs.filter((x) => x.status !== "OK")) {
      expect(c.observed).toBeTruthy();
      expect(c.why).toBeTruthy();
      expect(c.fix).toBeTruthy();
      expect(["yes", "with_approval", "no"]).toContain(c.koraCanFix);
    }
  });
  it("fails an unreachable business", () => {
    const f = emptyFacts("Ghost");
    const cs = evaluatePresenceHealth(base({ facts: f }));
    expect(byId(cs, "contact.reachable")?.status).toBe("FAIL");
  });
  it("detects drift between profile and live site", () => {
    const live = BusinessFactsSchema.parse({
      identity: { name: "Mama Ngozi Kitchen" },
      contact: { phone: "+2348099999999", whatsapp: "+2348012345678" },
      availability: { hours: [{ days: "Mon-Sat", hours: "9am-8pm" }] },
      offer: {},
    });
    const c = byId(
      evaluatePresenceHealth(
        base({ site: { ...base().site, liveFacts: live } }),
      ),
      "website.drift",
    );
    expect(c?.status).toBe("WARN");
    expect(c?.observed).toContain("phone number");
    expect(c?.koraCanFix).toBe("with_approval");
  });
  it("does not report drift when only formatting differs", () => {
    const live = structuredClone(base().facts);
    live.contact.phone = "+234 801 234 5678";
    const c = byId(
      evaluatePresenceHealth(
        base({ site: { ...base().site, liveFacts: live } }),
      ),
      "website.drift",
    );
    expect(c?.status).toBe("OK");
  });
  it("flags stale offers and excludes them from the graph's active offers", () => {
    const facts = structuredClone(base().facts);
    facts.offer.offers = [
      { id: "eid", title: "Eid platter", detail: "", endsOn: "2026-06-01" },
      { id: "new", title: "Weekday lunch", detail: "" },
    ];
    const inputs = base({ facts });
    expect(byId(evaluatePresenceHealth(inputs), "offer.stale")?.status).toBe(
      "WARN",
    );
    const g = buildPresenceGraph(inputs);
    expect(g.offer.activeOffers.map((o) => o.id)).toEqual(["new"]);
    expect(g.offer.expiredOffers.map((o) => o.id)).toEqual(["eid"]);
  });
  it("treats no connected channels as unknown, not as failure or success", () => {
    expect(
      byId(evaluatePresenceHealth(base()), "distribution.channels")?.status,
    ).toBe("UNKNOWN");
  });
  it("reports expired channel auth as a failure that needs the owner", () => {
    const cs = evaluatePresenceHealth(
      base({
        channels: [
          { provider: "instagram", state: "AUTH_EXPIRED", account: "@mama" },
        ],
      }),
    );
    const c = byId(cs, "distribution.instagram");
    expect(c?.status).toBe("FAIL");
    expect(c?.koraCanFix).toBe("no");
    expect(c?.authorization).toMatch(/sign/i);
  });
  it("escalates customers waiting more than a day", () => {
    const cs = evaluatePresenceHealth(
      base({
        demand: {
          enquiries30d: 4,
          waiting: 2,
          oldestWaitingAt: "2026-06-08T00:00:00Z",
        },
      }),
    );
    expect(byId(cs, "demand.waiting")?.status).toBe("FAIL");
  });
  it("never produces a numeric score", () => {
    const s = summarizeHealth(evaluatePresenceHealth(base()));
    expect(Object.keys(s)).toEqual(["counts", "headline", "attention"]);
    expect(s.headline).not.toMatch(/\d+\s*\/\s*100|%|score/i);
  });
  it("flags an open incident above everything else", () => {
    const s = summarizeHealth(
      evaluatePresenceHealth(
        base({
          operations: {
            status: "Needs attention",
            lastCheckAt: now.toISOString(),
            openIncidents: 1,
          },
        }),
      ),
    );
    expect(s.attention[0]?.status).toBe("FAIL");
    expect(s.headline).toMatch(/attention now/);
  });
});

describe("graph", () => {
  it("lists every provider, marking unconnected ones explicitly", () => {
    const g = buildPresenceGraph(
      base({
        channels: [
          { provider: "facebook", state: "CONNECTED", account: "Mama" },
        ],
      }),
    );
    expect(g.distribution.channels).toHaveLength(7);
    expect(
      g.distribution.channels.find((c) => c.provider === "instagram")?.state,
    ).toBe("NOT_CONNECTED");
    expect(
      g.distribution.channels.find((c) => c.provider === "facebook")?.state,
    ).toBe("CONNECTED");
  });
});

describe("brand kit", () => {
  const v1 = parseSiteSpec({
    version: 1,
    business: { name: "Acme" },
    brand: {
      primaryColor: "#1f4fd8",
      accentColor: "#f59e0b",
      tone: "friendly",
    },
    seo: { title: "Acme" },
    pages: [
      {
        slug: "home",
        title: "Home",
        sections: [{ type: "hero", heading: "Hi", subheading: "" }],
      },
    ],
    footer: {},
  });
  it("derives a readable kit from a v1 site", () => {
    const kit = deriveBrandKit(v1);
    expect(kit.voice.tone).toBe("warm");
    expect(brandKitIssues(kit)).toEqual([]);
  });
  it("rejects an owner override that breaks legibility", () => {
    const kit = deriveBrandKit(v1);
    kit.colors.primaryText = kit.colors.primary;
    expect(brandKitIssues(kit).length).toBeGreaterThan(0);
  });
});

describe("tiers", () => {
  it("keeps agent and campaigns above Plus", () => {
    expect(hasFeature("PLUS", "marketing.agent")).toBe(false);
    expect(hasFeature("PRO", "marketing.agent")).toBe(true);
    expect(lowestTierWith("publishing")).toBe("PLUS");
    expect(lowestTierWith("brand.kit")).toBe("LAUNCH");
  });
});

describe("applyFactsToSpec", () => {
  it("moves business facts only and never mutates the input", async () => {
    const { applyFactsToSpec } = await import("../src/index.js");
    const spec = parseSiteSpec({
      version: 1,
      business: { name: "Old", phone: "+2348000000000" },
      brand: {},
      seo: { title: "Old" },
      pages: [
        {
          slug: "home",
          title: "Home",
          sections: [{ type: "hero", heading: "Hello", subheading: "" }],
        },
      ],
      footer: {},
    });
    const before = JSON.stringify(spec);
    const facts = base().facts;
    const out = applyFactsToSpec(spec, facts);
    expect(JSON.stringify(spec)).toBe(before);
    expect(out.business.name).toBe("Mama Ngozi Kitchen");
    expect(out.business.phone).toBe("+2348012345678");
    expect(out.pages).toEqual(spec.pages);
  });
});

describe("one business, one truth", () => {
  it("flags an ended offer that is still on the website or in queued posts", () => {
    const i = base({
      staleness: { websiteMentions: ["Eid platter"], scheduledPosts: 2 },
    });
    const cs = evaluatePresenceHealth(i);
    expect(byId(cs, "offer.on_website")?.status).toBe("WARN");
    expect(byId(cs, "offer.on_website")?.koraCanFix).toBe("with_approval");
    expect(byId(cs, "offer.scheduled_stale")?.status).toBe("FAIL");
    const clean = evaluatePresenceHealth(
      base({ staleness: { websiteMentions: [], scheduledPosts: 0 } }),
    );
    expect(byId(clean, "offer.on_website")?.status).toBe("OK");
    expect(byId(clean, "offer.scheduled_stale")?.status).toBe("OK");
    // when Kora has not checked, it says nothing rather than reporting OK
    expect(
      byId(evaluatePresenceHealth(base()), "offer.on_website"),
    ).toBeUndefined();
  });
});
