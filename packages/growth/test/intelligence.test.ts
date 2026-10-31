import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_NOTE,
  newTrackCode,
  isLikelyBot,
  isSensitive,
  normalizeMetrics,
  outcomeEntry,
  suggestReply,
  summarizeAttribution,
  summarizeReviews,
  totals,
  trackedUrl,
  validateDraft,
  voiceFromMemory,
  type ContentContext,
} from "../src/index.js";

describe("attribution", () => {
  it("issues letter-only codes and tracked URLs that carry UTMs", () => {
    for (let i = 0; i < 50; i++) expect(newTrackCode()).toMatch(/^[a-z]{8}$/);
    const u = new URL(
      trackedUrl("https://mama.example/", {
        code: "abcdefgh",
        provider: "facebook",
        campaign: "Lunch Launch!",
        content: "Last chance",
      }),
    );
    expect(u.searchParams.get("k")).toBe("abcdefgh");
    expect(u.searchParams.get("utm_source")).toBe("facebook");
    expect(u.searchParams.get("utm_campaign")).toBe("lunch-launch");
    expect(u.searchParams.get("utm_content")).toBe("last-chance");
  });
  it("a tracked link in a caption is not mistaken for an invented price or phone number", () => {
    const ctx = {
      business: "M",
      industry: "",
      city: null,
      description: "",
      services: [],
      offers: [],
      expiredOfferIds: [],
      expiredOfferTitles: [],
      hours: [],
      notice: null,
      contact: { whatsapp: null, phone: null, email: null },
      voice: { tone: "warm", use: [], avoid: [], language: "en" },
    } as ContentContext;
    const url = trackedUrl("https://m.example/", {
      code: "abcdefgh",
      provider: "facebook",
      campaign: "x20260610123456",
      content: "n1",
    });
    expect(
      validateDraft(
        { headline: "Hi", body: `Come by ${url}`, cta: "", hashtags: [] },
        ctx,
        "facebook",
      ),
    ).toEqual([]);
  });
  it("summarises by channel and always carries the limits note", () => {
    const s = summarizeAttribution([
      {
        code: "a",
        provider: "facebook",
        campaignId: null,
        label: "",
        visits: 5,
        whatsappTaps: 2,
        callTaps: 0,
        enquiries: 1,
      },
      {
        code: "b",
        provider: "facebook",
        campaignId: null,
        label: "",
        visits: 1,
        whatsappTaps: 0,
        callTaps: 1,
        enquiries: 0,
      },
      {
        code: "c",
        provider: "instagram",
        campaignId: null,
        label: "",
        visits: 3,
        whatsappTaps: 0,
        callTaps: 0,
        enquiries: 0,
      },
    ]);
    expect(s.visits).toBe(9);
    expect(s.byChannel.facebook).toEqual({
      visits: 6,
      whatsappTaps: 2,
      callTaps: 1,
      enquiries: 1,
    });
    expect(s.note).toBe(ATTRIBUTION_NOTE);
    expect(s.note).toMatch(/not measured/);
    expect(JSON.stringify(s)).not.toMatch(/revenue|sales generated/i);
  });
  it("ignores bots and link-preview fetchers", () => {
    expect(isLikelyBot("facebookexternalhit/1.1")).toBe(true);
    expect(isLikelyBot("WhatsApp/2.23")).toBe(true);
    expect(isLikelyBot(undefined)).toBe(true);
    expect(
      isLikelyBot(
        "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });
});

describe("social analytics", () => {
  const raw = [
    {
      scope: "ACCOUNT" as const,
      externalId: "",
      name: "page_impressions",
      value: 100,
      periodEnd: "2026-06-09",
    },
    {
      scope: "ACCOUNT" as const,
      externalId: "",
      name: "page_impressions",
      value: 50,
      periodEnd: "2026-06-10",
    },
    {
      scope: "ACCOUNT" as const,
      externalId: "",
      name: "page_fans",
      value: 400,
      periodEnd: "2026-06-09",
    },
    {
      scope: "ACCOUNT" as const,
      externalId: "",
      name: "page_fans",
      value: 410,
      periodEnd: "2026-06-10",
    },
    {
      scope: "ACCOUNT" as const,
      externalId: "",
      name: "weird_new_metric",
      value: 7,
      periodEnd: "2026-06-10",
    },
  ];
  it("maps provider names to shared metrics and never guesses unknown ones", () => {
    const n = normalizeMetrics("facebook", raw);
    expect(n.find((x) => x.name === "weird_new_metric")!.metric).toBe(
      "unmapped",
    );
    const t = totals(n);
    expect(t.find((x) => x.metric === "impressions")!.total).toBe(150);
    expect(t.find((x) => x.metric === "followers")!.total).toBe(410);
    expect(t.some((x) => x.metric === ("unmapped" as never))).toBe(false);
    expect(t.find((x) => x.metric === "impressions")!.from).toEqual([
      "page_impressions",
    ]);
  });
  it("drops invalid values", () => {
    expect(
      normalizeMetrics("instagram", [
        {
          scope: "ACCOUNT",
          externalId: "",
          name: "reach",
          value: -1,
          periodEnd: "2026-06-10",
        },
        {
          scope: "ACCOUNT",
          externalId: "",
          name: "reach",
          value: NaN,
          periodEnd: "2026-06-10",
        },
      ]),
    ).toEqual([]);
  });
});

describe("reviews", () => {
  it("treats negative and conduct/safety/money reviews as sensitive, and never drafts a reply for them", () => {
    expect(isSensitive({ rating: 2, body: "meh" })).toBe(true);
    expect(isSensitive({ rating: 5, body: "I want a refund" })).toBe(true);
    expect(isSensitive({ rating: 5, body: "Lovely food" })).toBe(false);
    expect(
      suggestReply({ rating: 1, body: "terrible" }, "Mama", "warm"),
    ).toBeNull();
    expect(
      suggestReply({ rating: 5, body: "food poisoning!" }, "Mama", "warm"),
    ).toBeNull();
    expect(
      suggestReply({ rating: 3, body: "okay" }, "Mama", "warm"),
    ).toBeNull();
  });
  it("thanks a clearly positive review, without invented offers or promises", () => {
    const r = suggestReply(
      { rating: 5, body: "Great jollof", author: "Ada Obi" },
      "Mama Ngozi",
      "warm",
    )!;
    expect(r).toContain("Ada");
    expect(r).toContain("Mama Ngozi");
    expect(r).not.toMatch(/discount|free|₦|%/i);
  });
  it("summarises honestly and only names a theme at least three reviews share", () => {
    const rows = [
      {
        rating: 5,
        body: "Delicious jollof rice",
        status: "NEW",
        sensitive: false,
      },
      {
        rating: 5,
        body: "Best jollof in town",
        status: "REPLIED",
        sensitive: false,
      },
      {
        rating: 4,
        body: "Jollof was hot and tasty",
        status: "NEW",
        sensitive: false,
      },
      { rating: 1, body: "Late delivery", status: "NEW", sensitive: true },
    ];
    const s = summarizeReviews(rows);
    expect(s.average).toBe(3.8);
    expect(s.unanswered).toBe(3);
    expect(s.needsYou).toBe(1);
    expect(s.themes).toEqual([{ word: "jollof", reviews: 3 }]);
    expect(summarizeReviews([]).average).toBeNull();
  });
});

describe("business memory", () => {
  it("folds owner preferences into the voice", () => {
    expect(
      voiceFromMemory([
        { kind: "PREFERENCE", key: "avoid_word", value: "cheap" },
        { kind: "PREFERENCE", key: "use_word", value: "fresh" },
        { kind: "FACT", key: "avoid_word", value: "ignored" },
      ]),
    ).toEqual({ avoid: ["cheap"], use: ["fresh"] });
  });
  it("records outcomes as counts with no causal claim, and says when nothing was measured", () => {
    const base = {
      campaignId: "c1",
      name: "Lunch launch",
      offerTitle: "Weekday lunch",
      endedOn: "2026-06-20",
      posts: { planned: 6, published: 5 },
      channels: ["facebook"],
    };
    const a = outcomeEntry({
      ...base,
      tracked: { visits: 12, whatsappTaps: 3, callTaps: 1, enquiries: 2 },
    });
    expect(a.value).toContain("12 visits");
    expect(a.value).not.toMatch(/because|caused|revenue|sales/i);
    expect(a.key).toBe("campaign:c1");
    expect(
      outcomeEntry({
        ...base,
        tracked: { visits: 0, whatsappTaps: 0, callTaps: 0, enquiries: 0 },
      }).value,
    ).toMatch(/No activity/);
  });
});
