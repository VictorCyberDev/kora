import { describe, expect, it } from "vitest";
import {
  ASSET_FORMATS,
  ASSET_LAYOUTS,
  BrandKitSchema,
  COLORWAYS,
  renderAssetSvg,
  auditHtml,
  budgetBreaches,
  buildContextPacket,
  costGate,
  followUpFor,
  gbpChecklist,
  handoffPack,
  localBusinessJsonLd,
  memoryFromFeedback,
  nextRequestState,
  performanceReport,
  pilotSummary,
  signShare,
  slaRemainingHours,
  staticAssetQuality,
  storyboardFor,
  storyboardIssues,
  tasteProfile,
  todayActions,
  verifyShare,
  BusinessFactsSchema,
  type CreativeDirection,
  type TodayInput,
} from "./index.js";

const g = {
  visual: {
    ink: "#111111",
    canvas: "#faf6ef",
    primary: "#b2452c",
    accent: "#e9a23b",
    displayFamily: "DM Serif Display",
    bodyFamily: "Manrope",
    shape: "soft",
    imageryStyle: "photo-led",
  },
  verbal: {
    tone: "warm",
    use: [],
    avoid: ["luxury"],
    language: "en",
    sentenceRules: [],
  },
};
const facts = BusinessFactsSchema.parse({
  identity: {
    name: "Ada Cakes",
    description: "Birthday cakes and cupcakes baked to order in Yaba, Lagos.",
    industry: "Bakery",
  },
  contact: {
    phone: "+2348012345678",
    city: "Lagos",
    address: "12 Herbert Macaulay Way",
  },
  availability: { hours: [{ days: "Mon-Sat", hours: "9am-6pm" }] },
  offer: { services: ["Birthday cakes"], offers: [] },
  social: [],
});

describe("M14 static asset quality", () => {
  const good = `<svg><rect width="1080" height="1080" fill="#faf6ef"/><text x="80" y="300" font-size="96" font-family="DM Serif Display" fill="#111111">Fresh cakes</text></svg>`;
  it("passes an on-brand asset", () =>
    expect(staticAssetQuality(good, g)).toEqual([]));
  it("blocks low contrast, tiny text and avoided words", () => {
    const bad = `<svg><rect width="1080" height="1080" fill="#faf6ef"/><text x="80" y="300" font-size="20" font-family="Comic Sans" fill="#f5f0e8">A luxury cake</text></svg>`;
    const r = staticAssetQuality(bad, g).map((f) => f.rule);
    expect(r).toEqual(
      expect.arrayContaining([
        "small-text",
        "contrast",
        "off-brand-font",
        "avoid-word",
      ]),
    );
  });
  it("flags an asset with no text and text in the crop zone", () => {
    expect(
      staticAssetQuality(
        `<svg><rect width="1080" height="1080" fill="#faf6ef"/></svg>`,
        g,
      ).map((f) => f.rule),
    ).toContain("no-text");
    expect(
      staticAssetQuality(
        good.replace('x="80" y="300"', 'x="5" y="300"'),
        g,
      ).map((f) => f.rule),
    ).toContain("safe-area");
  });
});

describe("M14 against the real renderer", () => {
  it("every format, layout and colourway the studio can render passes the gate", () => {
    const kit = BrandKitSchema.parse({
      colors: {
        ink: "#1c1917",
        canvas: "#faf6ef",
        primary: "#b2452c",
        primaryText: "#ffffff",
        accent: "#e9a23b",
        accentText: "#1c1917",
        muted: "#6b6258",
      },
      typography: {
        pairing: "serif-sans",
        displayFamily: "DM Serif Display",
        bodyFamily: "Manrope",
      },
      voice: { tone: "warm", use: [], avoid: [] },
      imagery: {},
    });
    const gen = {
      visual: {
        ink: kit.colors.ink,
        canvas: kit.colors.canvas,
        primary: kit.colors.primary,
        accent: kit.colors.accent,
        displayFamily: kit.typography.displayFamily,
        bodyFamily: kit.typography.bodyFamily,
        shape: "soft",
        imageryStyle: "abstract",
      },
      verbal: {
        tone: "warm",
        use: [],
        avoid: [],
        language: "en",
        sentenceRules: [],
      },
    };
    let n = 0;
    for (const f of Object.keys(ASSET_FORMATS) as Array<
      keyof typeof ASSET_FORMATS
    >)
      for (const l of ASSET_LAYOUTS)
        for (const c of COLORWAYS) {
          const r = renderAssetSvg(
            {
              format: f,
              category: "offer",
              layout: l,
              colorway: c,
              headline: "Birthday cakes baked to order",
              subline: "Order by Thursday",
              cta: "Order on WhatsApp",
              contact: "+234 801 234 5678",
            } as never,
            kit,
            "Ada Cakes",
            1,
          );
          expect(
            staticAssetQuality(r.svg, gen, {
              width: r.width,
              height: r.height,
            }),
            `${f}/${l}/${c}`,
          ).toEqual([]);
          n++;
        }
    expect(n).toBe(72);
  });
});

describe("M15 storyboard", () => {
  const d: CreativeDirection = {
    angle: "moment",
    bigIdea: "",
    headline: "October box, until 31 Oct",
    visual: { treatment: "t", subject: "s", crop: "c" },
    tone: "direct",
    needs: [],
  };
  it("plans scenes that fill the duration and flag unreadable pacing", () => {
    const s = storyboardFor(d, {
      cta: "Order on WhatsApp",
      detail: "Six cupcakes, one cake",
    });
    expect(s.scenes.map((x) => x.id)).toEqual(["open", "detail", "close"]);
    expect(s.durationSec).toBeGreaterThan(6.5);
    expect(s.reducedMotion).toBe("still-frames");
    expect(storyboardIssues(s)).toEqual([]);
    const fast = storyboardFor(
      {
        ...d,
        headline:
          "one two three four five six seven eight nine ten eleven twelve",
      },
      { cta: "Go", durationSec: 4 },
    );
    expect(storyboardIssues(fast).length).toBeGreaterThan(0);
  });
});

describe("M16 hand-off", () => {
  it("refuses a pack for text changed after approval, and never claims publication", () => {
    expect(() =>
      handoffPack({
        channel: "instagram",
        caption: "x",
        assetFile: "a.png",
        approvedHash: "a",
        currentHash: "b",
      }),
    ).toThrow();
    const p = handoffPack({
      channel: "whatsapp",
      caption: "x",
      assetFile: "a.png",
      approvedHash: "a",
      currentHash: "a",
    });
    expect(p.manual).toBe(true);
    expect(p.steps.length).toBeGreaterThan(2);
  });
});

describe("M17 today", () => {
  const base: TodayInput = {
    waitingLeads: 0,
    oldestWaitingHours: 0,
    approvalsPending: 0,
    staleOffers: [],
    truthQuestions: [],
    genomeGaps: [],
    openIncidents: 0,
    scheduledThisWeek: 0,
    daysSinceLastPost: null,
    qualityGrade: null,
  };
  it("ranks by weight with evidence, limited to five", () => {
    const a = todayActions({
      ...base,
      openIncidents: 1,
      waitingLeads: 2,
      oldestWaitingHours: 30,
      approvalsPending: 3,
      staleOffers: ["Easter box"],
      truthQuestions: ["What is the price?"],
      genomeGaps: ["Why you?"],
      daysSinceLastPost: 12,
      qualityGrade: "K1",
    });
    expect(a).toHaveLength(5);
    expect(a[0]!.id).toBe("incident");
    expect(a[1]!.id).toBe("leads");
    expect(a.every((x) => x.why.length > 0)).toBe(true);
  });
  it("returns nothing when there is nothing to do", () =>
    expect(todayActions(base)).toEqual([]));
});

describe("M18/M22 discovery and audit", () => {
  it("builds structured data only from owner facts", () => {
    const ld = localBusinessJsonLd(facts, "https://ada.example");
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.telephone).toBe("+2348012345678");
    const spec = (
      ld.openingHoursSpecification as Array<Record<string, unknown>>
    )[0]!;
    expect(spec.dayOfWeek).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
    expect(spec.opens).toBe("09:00");
    expect(spec.closes).toBe("18:00");
    expect(ld).not.toHaveProperty("aggregateRating");
  });
  it("checks the Google Business profile list", () => {
    expect(gbpChecklist(facts).every((c) => c.done)).toBe(true);
  });
  it("audits a weak and a strong page", () => {
    const weak = auditHtml(
      "<html><body><h1>a</h1><h1>b</h1><img src=x></body></html>",
      "http://x.example",
    );
    expect(weak.passed).toBeLessThan(3);
    expect(weak.findings.find((f) => f.id === "https")!.fix).toBeTruthy();
    const strong = auditHtml(
      `<html lang="en"><head><title>Ada Cakes: birthday cakes in Yaba</title><meta name="description" content="Birthday cakes and cupcakes baked to order in Yaba, Lagos. Order on WhatsApp for pickup."><meta name="viewport" content="width=device-width"><script type="application/ld+json">{}</script></head><body><h1>Ada</h1><img src=a alt="cake"><a href="tel:+234">Call</a></body></html>`,
      "https://ada.example",
    );
    expect(strong.passed).toBe(strong.total);
  });
});

describe("M19 follow-up", () => {
  it("replies first, and never nudges or asks for a review without consent", () => {
    expect(
      followUpFor({
        status: "NEW",
        lastInboundHoursAgo: 5,
        lastOutboundHoursAgo: null,
        hasConsentToMessage: false,
        completedDaysAgo: null,
      }).kind,
    ).toBe("reply_now");
    const n = followUpFor({
      status: "FOLLOW_UP",
      lastInboundHoursAgo: 60,
      lastOutboundHoursAgo: 50,
      hasConsentToMessage: false,
      completedDaysAgo: null,
    });
    expect(n.kind).toBe("nudge");
    expect(n.blockedBecause).toMatch(/agreed/);
    const r = followUpFor({
      status: "WON",
      lastInboundHoursAgo: null,
      lastOutboundHoursAgo: null,
      hasConsentToMessage: true,
      completedDaysAgo: 3,
    });
    expect(r.kind).toBe("ask_review");
    expect(r.requiresApproval).toBe(true);
    expect(
      followUpFor({
        status: "LOST",
        lastInboundHoursAgo: null,
        lastOutboundHoursAgo: null,
        hasConsentToMessage: true,
        completedDaysAgo: null,
      }).kind,
    ).toBe("none");
  });
});

describe("M20 performance", () => {
  it("labels evidence and refuses causal claims", () => {
    const r = performanceReport({
      trackedVisits: 40,
      whatsappTaps: 6,
      callTaps: 2,
      enquiries: 3,
      platformReach: null,
      priorEnquiries: 4,
      newCustomersEstimate: 2,
    });
    expect(
      r.lines.find((l) => l.label.startsWith("New customers"))!.evidence,
    ).toBe("ESTIMATED");
    expect(r.headline).toMatch(/rose from 4 to 11.*cannot say/);
    expect(r.caveats.join(" ")).toMatch(/not connected/);
    expect(
      performanceReport({
        trackedVisits: 0,
        whatsappTaps: 0,
        callTaps: 0,
        enquiries: 0,
        platformReach: null,
        priorEnquiries: null,
        newCustomersEstimate: null,
      }).headline,
    ).toMatch(/not counted any/);
  });
});

describe("M21 learning", () => {
  it("claims a taste only after enough judgements", () => {
    const h = (label: "LOVE" | "OFF_BRAND", t: string[]) => ({
      subject: "s",
      label,
      traits: t,
    });
    expect(
      tasteProfile([h("LOVE", ["close-crop"]), h("LOVE", ["close-crop"])])
        .prefers,
    ).toEqual([]);
    const p = tasteProfile([
      h("LOVE", ["close-crop"]),
      h("LOVE", ["close-crop"]),
      h("LOVE", ["close-crop"]),
      h("OFF_BRAND", ["neon"]),
      h("OFF_BRAND", ["neon"]),
      h("OFF_BRAND", ["neon"]),
    ]);
    expect(p).toEqual({ prefers: ["close-crop"], avoids: ["neon"] });
    expect(
      memoryFromFeedback({
        subject: "post-1",
        label: "DISLIKE",
        note: "too busy",
        traits: [],
      })[0]!.value,
    ).toContain("too busy");
  });
});

describe("M23 share tokens", () => {
  const now = 1_000_000;
  it("verifies, expires and rejects tampering", () => {
    const t = signShare("s3cret", {
      kind: "audit",
      id: "a1",
      expiresAt: now + 1000,
    });
    expect(verifyShare("s3cret", t, now)).toEqual({
      ok: true,
      kind: "audit",
      id: "a1",
    });
    expect(verifyShare("s3cret", t, now + 2000)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifyShare("other", t, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    const [b, s] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ kind: "report", id: "a1", expiresAt: now + 1000 }),
    ).toString("base64url");
    expect(verifyShare("s3cret", `${forged}.${s}`, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(verifyShare("s3cret", "garbage", now)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(b).toBeTruthy();
  });
});

describe("M24 pilot", () => {
  it("excludes non-consenting businesses and says when it is not conclusive", () => {
    const s = pilotSummary([
      {
        id: "a",
        consented: true,
        metrics: { enquiries_per_week: 5, rework_rate: 0.2 },
      },
      {
        id: "b",
        consented: true,
        metrics: { enquiries_per_week: 1, rework_rate: 0.5 },
      },
      { id: "c", consented: false, metrics: { enquiries_per_week: 100 } },
    ]);
    expect(s.counted).toBe(2);
    expect(s.excludedWithoutConsent).toBe(1);
    expect(s.conclusive).toBe(false);
    expect(s.rows.find((r) => r.metric === "enquiries_per_week")!.mean).toBe(3);
    expect(
      s.rows.find((r) => r.metric === "owner_quality_rating")!.met,
    ).toBeNull();
  });
});

describe("M25 managed requests", () => {
  it("follows the allowed path only", () => {
    let s = nextRequestState("OPEN", "start");
    s = nextRequestState(s, "ask_owner");
    s = nextRequestState(s, "owner_replied");
    s = nextRequestState(s, "deliver");
    expect(nextRequestState(s, "reject")).toBe("IN_PROGRESS");
    expect(nextRequestState(s, "accept")).toBe("ACCEPTED");
    expect(() => nextRequestState("ACCEPTED", "start")).toThrow();
    expect(() => nextRequestState("OPEN", "deliver")).toThrow();
  });
  it("pauses the clock while waiting on the owner", () => {
    const c = new Date("2026-10-01T00:00:00Z");
    expect(
      slaRemainingHours(c, new Date("2026-10-02T00:00:00Z"), "IN_PROGRESS"),
    ).toBe(24);
    expect(
      slaRemainingHours(c, new Date("2026-10-04T00:00:00Z"), "IN_PROGRESS"),
    ).toBeLessThan(0);
    expect(
      slaRemainingHours(c, new Date("2026-10-04T00:00:00Z"), "NEEDS_OWNER"),
    ).toBeNull();
  });
});

describe("M26 scale", () => {
  it("fits context packets to a budget by relevance", () => {
    const p = buildContextPacket(
      "caption",
      [
        { key: "hours", value: "Mon-Sat 9-6", relevance: 5 },
        { key: "history", value: "x".repeat(4000), relevance: 1 },
        { key: "offer", value: "October box", relevance: 9 },
      ],
      { tone: "warm", use: [], avoid: [] },
      200,
    );
    expect(p.facts.map((f) => f.key)).toEqual(["offer", "hours"]);
    expect(p.approxTokens).toBeLessThanOrEqual(200);
  });
  it("gates cost and budgets", () => {
    expect(
      costGate({
        spentMinor: 0,
        budgetMinor: 1000,
        estimateMinor: 50,
        perCallCapMinor: 100,
      }),
    ).toEqual({ allow: true, remaining: 950 });
    expect(
      costGate({
        spentMinor: 990,
        budgetMinor: 1000,
        estimateMinor: 50,
        perCallCapMinor: 100,
      }),
    ).toEqual({ allow: false, reason: "monthly_budget" });
    expect(
      costGate({
        spentMinor: 0,
        budgetMinor: 1000,
        estimateMinor: 500,
        perCallCapMinor: 100,
      }),
    ).toEqual({ allow: false, reason: "per_call_cap" });
    expect(budgetBreaches({ site_html_kb: 250, site_requests: 10 })).toEqual([
      "site_html_kb: 250 > 200",
    ]);
  });
});
