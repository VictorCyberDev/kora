import { describe, expect, it } from "vitest";
import {
  BundleError,
  CampaignInputSchema,
  buildGrowthBrief,
  buildPresenceGraph,
  planBundle,
  recommend,
  BusinessFactsSchema,
  type AgentInputs,
  type PresenceInputs,
} from "../src/index.js";
import { parseSiteSpec } from "@kora/site-schema";
import { deriveBrandKit } from "../src/index.js";

const now = new Date("2026-06-10T12:00:00Z");
const kit = deriveBrandKit(
  parseSiteSpec({
    version: 1,
    business: { name: "M" },
    brand: {},
    seo: { title: "x" },
    pages: [
      {
        slug: "home",
        title: "H",
        sections: [{ type: "hero", heading: "H", subheading: "" }],
      },
    ],
    footer: {},
  }),
);
const facts = BusinessFactsSchema.parse({
  identity: {
    name: "Mama",
    description: "Food in Lagos kitchen for parties and daily lunch.",
  },
  contact: { whatsapp: "+2348012345678" },
  availability: {},
  offer: {
    services: ["Jollof"],
    offers: [
      { id: "lunch", title: "Weekday lunch", detail: "" },
      { id: "eid", title: "Eid platter", detail: "", endsOn: "2026-06-01" },
    ],
  },
});
const pin: PresenceInputs = {
  now,
  facts,
  site: {
    exists: true,
    published: true,
    url: null,
    publishedAt: null,
    liveFacts: null,
  },
  domain: { custom: null, verified: false, tls: "unknown" },
  brand: { version: 1, kit },
  channels: [],
  proof: { passports: 0, lastPassportAt: null },
  operations: { status: null, lastCheckAt: null, openIncidents: 0 },
  demand: { enquiries30d: 0, waiting: 0, oldestWaitingAt: null },
};
const base = (o: Partial<AgentInputs> = {}): AgentInputs => ({
  now,
  graph: buildPresenceGraph(pin),
  customers: { waiting: 0, waitingOverDay: 0, oldestWaitingAt: null },
  calendar: {
    publishedLast14d: 0,
    lastPublishedAt: null,
    scheduledNext7d: 0,
    pending: 0,
  },
  offerCoverage: [
    { id: "lunch", title: "Weekday lunch", lastPostAt: null, endsOn: null },
  ],
  connectedPostingChannels: ["facebook"],
  openIncidents: 0,
  hasBrandKit: true,
  ...o,
});

describe("marketing agent", () => {
  it("every recommendation is evidenced, hypothesised and policy-bound", () => {
    const rs = recommend(
      base({
        customers: {
          waiting: 2,
          waitingOverDay: 1,
          oldestWaitingAt: "2026-06-08T00:00:00Z",
        },
        openIncidents: 1,
        hasBrandKit: false,
      }),
    );
    expect(rs.length).toBeGreaterThan(3);
    for (const r of rs) {
      expect(r.evidence.length).toBeGreaterThan(0);
      for (const e of r.evidence) expect(e.source).toBeTruthy();
      expect(r.hypothesis).toMatch(/\w/);
      expect(["AUTO_SAFE", "APPROVAL_REQUIRED", "DENY"]).toContain(
        r.policy.authority,
      );
      expect(r.approvalNeeded).toBe(r.policy.authority === "APPROVAL_REQUIRED");
    }
    expect(new Set(rs.map((r) => r.key)).size).toBe(rs.length);
  });
  it("puts customers waiting first and never offers to reply for the owner", () => {
    const rs = recommend(
      base({
        customers: { waiting: 3, waitingOverDay: 2, oldestWaitingAt: null },
      }),
    );
    expect(rs[0]!.rule).toBe("customers_waiting");
    expect(rs[0]!.koraCanExecute).toBe(false);
    expect(rs[0]!.policy.authority).toBe("DENY");
  });
  it("suggests holding promotion when the site is down", () => {
    expect(
      recommend(base({ openIncidents: 1 })).some(
        (r) => r.rule === "site_incident_hold",
      ),
    ).toBe(true);
  });
  it("flags an ended offer, and does not promote an ended or recently promoted one", () => {
    const rs = recommend(
      base({
        offerCoverage: [
          {
            id: "lunch",
            title: "Weekday lunch",
            lastPostAt: "2026-06-08T00:00:00Z",
            endsOn: null,
          },
          {
            id: "eid",
            title: "Eid platter",
            lastPostAt: null,
            endsOn: "2026-06-01",
          },
        ],
      }),
    );
    expect(rs.some((r) => r.rule === "expired_offer")).toBe(true);
    expect(rs.some((r) => r.rule === "offer_not_promoted")).toBe(false);
  });
  it("only proposes drafts when a posting channel exists, and drafts are AUTO_SAFE", () => {
    expect(
      recommend(base({ connectedPostingChannels: [] })).some(
        (r) => r.action.type === "create_draft",
      ),
    ).toBe(false);
    const d = recommend(base()).find((r) => r.rule === "offer_not_promoted")!;
    expect(d.action).toMatchObject({
      type: "create_draft",
      goal: "announce_offer",
      offerId: "lunch",
    });
    expect(d.policy.authority).toBe("AUTO_SAFE");
    expect(d.confidence).not.toBe("high");
  });
  it("states hypotheses, never revenue or guaranteed outcomes", () => {
    const text = JSON.stringify(
      recommend(
        base({
          customers: { waiting: 1, waitingOverDay: 0, oldestWaitingAt: null },
          openIncidents: 1,
          hasBrandKit: false,
        }),
      ),
    );
    expect(text).not.toMatch(/guarantee|will increase|revenue|₦\d|% more/i);
  });
});

describe("growth brief", () => {
  const n = {
    period: { start: "2026-06-03", end: "2026-06-10" },
    enquiries: { current: 5, previous: 3 },
    waiting: 1,
    followUpsDue: 0,
    posts: { published: 2, failed: 0, byChannel: { facebook: 2 } },
    website: {
      uptimePercent: 99.5,
      checks: 200,
      incidents: 1,
      recovered: 1,
      openIncidents: 0,
    },
    presence: { open: 2, failing: 0 },
  };
  it("reports only measured numbers and compares only against real data", () => {
    const b = buildGrowthBrief(n);
    const text = JSON.stringify(b.sections);
    expect(text).toContain("up from 3");
    expect(text).toContain("99.5%");
    expect(b.headline).toMatch(/waiting/);
    expect(
      buildGrowthBrief({ ...n, enquiries: { current: 2, previous: 0 } })
        .sections[0]!.items[0]!.text,
    ).toMatch(/none the week before/);
    expect(
      buildGrowthBrief({ ...n, website: { ...n.website, uptimePercent: null } })
        .sections[2]!.items[0]!.value,
    ).toBeUndefined();
  });
  it("lists reach, visitors and revenue as unavailable with a reason", () => {
    const u = buildGrowthBrief(n)
      .unavailable.map((x) => x.topic)
      .join("|");
    expect(u).toMatch(/Reach/);
    expect(u).toMatch(/visitors/);
    expect(u).toMatch(/revenue/);
    expect(JSON.stringify(buildGrowthBrief(n))).not.toMatch(
      /caused|because of your post/i,
    );
  });
  it("puts an open incident ahead of everything", () => {
    expect(
      buildGrowthBrief({ ...n, website: { ...n.website, openIncidents: 1 } })
        .headline,
    ).toMatch(/website needs attention/);
  });
});

describe("campaign bundles", () => {
  const input = CampaignInputSchema.parse({
    name: "Lunch launch",
    offerId: "lunch",
    channels: ["instagram", "facebook", "whatsapp"],
    startOn: "2026-06-12",
    endOn: "2026-06-20",
  });
  it("spreads beats over the dates, one image shape per channel, no more than three beats per channel", () => {
    const s = planBundle(input, now);
    expect(
      s.filter((x) => x.channel === "instagram").map((x) => x.beat),
    ).toEqual(["launch", "reminder", "last_chance"]);
    expect(s.every((x) => Date.parse(x.at) >= now.getTime())).toBe(true);
    expect(s.find((x) => x.channel === "whatsapp")!.format).toBe(
      "whatsapp_promo",
    );
    expect(s.find((x) => x.channel === "instagram")!.format).toBe("portrait");
    expect(s.length).toBe(9);
  });
  it("a one-day campaign is a single launch per channel", () => {
    expect(
      planBundle({ ...input, endOn: undefined }, now).map((x) => x.beat),
    ).toEqual(["launch", "launch", "launch"]);
  });
  it("rejects bad ranges, long campaigns and campaigns entirely in the past; launch in the past moves forward", () => {
    expect(() => planBundle({ ...input, endOn: "2026-06-01" }, now)).toThrow(
      BundleError,
    );
    expect(() => planBundle({ ...input, endOn: "2026-09-30" }, now)).toThrow(
      /60 days/,
    );
    const late = planBundle(
      { ...input, startOn: "2026-06-01", endOn: "2026-06-11" },
      now,
    );
    expect(late.every((x) => Date.parse(x.at) > now.getTime())).toBe(true);
    expect(() =>
      planBundle(
        {
          ...input,
          startOn: "2026-05-01",
          endOn: "2026-05-01",
          channels: ["instagram"],
        },
        new Date("2026-07-01T00:00:00Z"),
      ),
    ).not.toThrow();
  });
  it("only accepts channels it can build for", () => {
    expect(() =>
      CampaignInputSchema.parse({ ...input, channels: ["tiktok"] }),
    ).toThrow();
  });
});
