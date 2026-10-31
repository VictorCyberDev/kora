import { describe, expect, it } from "vitest";
import { parseSiteSpec } from "@kora/site-schema";
import {
  AssetSpecSchema,
  BusinessFactsSchema,
  MotionSpecSchema,
  NotEnoughFacts,
  buildContentContext,
  buildPresenceGraph,
  deriveBrandKit,
  draftContent,
  frameCount,
  generateContent,
  motionFrameSvg,
  renderAssetSvg,
  validateAssetSpec,
  validateDraft,
  wrap,
  type ContentModel,
  type PresenceInputs,
} from "../src/index.js";

const now = new Date("2026-06-10T12:00:00Z");
const facts = BusinessFactsSchema.parse({
  identity: {
    name: "Mama Ngozi Kitchen",
    description: "Home-style Nigerian meals and party jollof in Lekki.",
    industry: "Catering",
  },
  contact: {
    phone: "+2348012345678",
    whatsapp: "+2348012345678",
    city: "Lagos",
  },
  availability: { hours: [{ days: "Mon-Sat", hours: "9am-8pm" }] },
  offer: {
    services: ["Party jollof", "Small chops"],
    offers: [
      {
        id: "lunch",
        title: "Weekday lunch",
        detail: "Rice, stew and plantain",
        price: "₦3,500",
      },
      { id: "eid", title: "Eid platter", detail: "", endsOn: "2026-06-01" },
    ],
  },
});
const kitSpec = parseSiteSpec({
  version: 1,
  business: { name: "Mama Ngozi Kitchen" },
  brand: { tone: "friendly" },
  seo: { title: "x" },
  pages: [
    {
      slug: "home",
      title: "Home",
      sections: [{ type: "hero", heading: "Hi", subheading: "" }],
    },
  ],
  footer: {},
});
const kit = deriveBrandKit(kitSpec);
const inputs: PresenceInputs = {
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
const ctx = buildContentContext(buildPresenceGraph(inputs), kit);

describe("content studio", () => {
  it("writes only from facts and refuses without them", () => {
    const d = draftContent(ctx, {
      goal: "announce_offer",
      channel: "instagram",
      offerId: "lunch",
    });
    expect(d.length).toBeGreaterThan(1);
    for (const x of d)
      expect(
        validateDraft(x, ctx, "instagram").filter(
          (i) => i.severity === "block",
        ),
      ).toEqual([]);
    expect(d[0]!.body).toContain("₦3,500");
    expect(() =>
      draftContent(ctx, {
        goal: "announce_offer",
        channel: "instagram",
        offerId: "eid",
      }),
    ).toThrow(/ended/);
    expect(() =>
      draftContent(ctx, {
        goal: "promote_service",
        channel: "instagram",
        service: "Wedding cakes",
      }),
    ).toThrow(NotEnoughFacts);
  });
  it("blocks invented prices, times, numbers, ended offers and avoided words", () => {
    const base = {
      headline: "Lunch",
      body: "x",
      cta: "",
      hashtags: [] as string[],
    };
    const codes = (body: string) =>
      validateDraft({ ...base, body }, ctx, "instagram").map((i) => i.code);
    expect(codes("Only ₦1,000 today")).toContain("unsupported_claim");
    expect(codes("Open till 11pm")).toContain("unsupported_claim");
    expect(codes("Call 08099988877 now")).toContain("wrong_contact");
    expect(codes("Our Eid platter is back")).toContain("expired_offer");
    expect(codes("The best jollof in Lagos")).toContain(
      "unsubstantiated_superlative",
    );
    expect(codes("Rice for ₦3,500, open 9am")).toEqual([]);
    const strict = { ...ctx, voice: { ...ctx.voice, avoid: ["cheap"] } };
    expect(
      validateDraft({ ...base, body: "So cheap!" }, strict, "instagram").map(
        (i) => i.code,
      ),
    ).toContain("banned_word");
  });
  it("enforces channel limits", () => {
    const long = {
      headline: "h",
      body: "a".repeat(1100),
      cta: "",
      hashtags: [],
    };
    expect(validateDraft(long, ctx, "whatsapp").map((i) => i.code)).toContain(
      "too_long",
    );
    expect(
      validateDraft(
        { ...long, body: "ok", hashtags: ["#abc"] },
        ctx,
        "whatsapp",
      ).map((i) => i.code),
    ).toContain("too_many_hashtags");
  });
  it("never lets a model's unvalidated output through: falls back to the deterministic writer", async () => {
    const req = {
      goal: "announce_offer",
      channel: "instagram",
      offerId: "lunch",
    } as const;
    const lying: ContentModel = () =>
      Promise.resolve({
        drafts: [
          {
            headline: "Half price!",
            body: "Everything ₦500 until 2am",
            cta: "",
            hashtags: [],
          },
        ],
      });
    const r = await generateContent(ctx, req, lying);
    expect(r.source).toBe("deterministic");
    expect(r.rejected.length).toBe(1);
    const junk: ContentModel = () => Promise.resolve({ nope: true });
    expect((await generateContent(ctx, req, junk)).source).toBe(
      "deterministic",
    );
    const boom: ContentModel = () => Promise.reject(new Error("timeout"));
    expect((await generateContent(ctx, req, boom)).modelError).toBe("timeout");
    const good: ContentModel = () =>
      Promise.resolve({
        drafts: [
          {
            headline: "Weekday lunch",
            body: "Rice, stew and plantain for ₦3,500.",
            cta: "",
            hashtags: ["#lagos"],
          },
        ],
      });
    expect((await generateContent(ctx, req, good)).source).toBe("model");
  });
  it("does not call a model at all when the facts are missing", async () => {
    let called = false;
    const m: ContentModel = () => ((called = true), Promise.resolve({}));
    await expect(
      generateContent(ctx, { goal: "announce_offer", channel: "instagram" }, m),
    ).rejects.toThrow(NotEnoughFacts);
    expect(called).toBe(false);
  });
});

describe("brand studio", () => {
  const spec = AssetSpecSchema.parse({
    format: "story",
    category: "offer",
    headline: "Weekday lunch",
    subline: "Rice, stew and plantain",
    cta: "Order on WhatsApp",
    contact: "+2348012345678",
  });
  it("is deterministic and stays inside the canvas for every format", () => {
    const a = renderAssetSvg(spec, kit, "Mama Ngozi Kitchen", 1);
    expect(renderAssetSvg(spec, kit, "Mama Ngozi Kitchen", 1).svg).toBe(a.svg);
    for (const format of [
      "square",
      "portrait",
      "story",
      "whatsapp_promo",
      "landscape",
      "flyer",
    ] as const) {
      const r = renderAssetSvg(
        { ...spec, format },
        kit,
        "Mama Ngozi Kitchen",
        1,
      );
      expect(r.svg).toContain(`viewBox="0 0 ${r.width} ${r.height}"`);
      for (const m of r.svg.matchAll(/<text x="(\d+)" y="(\d+)"/g)) {
        expect(Number(m[1])).toBeLessThan(r.width);
        expect(Number(m[2])).toBeLessThan(r.height);
      }
    }
  });
  it("escapes markup in owner text and handles very long words", () => {
    const r = renderAssetSvg(
      {
        ...spec,
        headline: "<script>alert(1)</script> & co",
        subline: "x".repeat(130),
      },
      kit,
      "A & B",
      1,
    );
    expect(r.svg).not.toContain("<script>");
    expect(r.svg).toContain("&lt;script&gt;");
    expect(
      wrap("supercalifragilisticexpialidocious".repeat(3), 40, 300, 2).length,
    ).toBeLessThanOrEqual(2);
  });
  it("rejects fields outside the controlled set and foreign phone numbers", () => {
    expect(() =>
      AssetSpecSchema.parse({ ...spec, fontFamily: "Comic Sans" }),
    ).toThrow();
    expect(() =>
      AssetSpecSchema.parse({ ...spec, headline: "x".repeat(61) }),
    ).toThrow();
    const issues = validateAssetSpec(
      { ...spec, contact: "+2348099999999" },
      kit,
      { contacts: ["+2348012345678"], expiredTitles: ["Eid platter"] },
    );
    expect(issues.some((i) => /not one of your numbers/.test(i.message))).toBe(
      true,
    );
    expect(
      validateAssetSpec({ ...spec, headline: "Eid platter!" }, kit, {
        contacts: ["+2348012345678"],
        expiredTitles: ["Eid platter"],
      }).some((i) => /ended/.test(i.message)),
    ).toBe(true);
    expect(
      validateAssetSpec(spec, kit, {
        contacts: ["+2348012345678"],
        expiredTitles: [],
      }),
    ).toEqual([]);
  });
  it("changing the kit changes new renders, not the old bytes", () => {
    const old = renderAssetSvg(spec, kit, "M", 1).svg;
    const k2 = {
      ...kit,
      colors: { ...kit.colors, primary: "#0b6b3a", primaryText: "#ffffff" },
    };
    expect(renderAssetSvg(spec, k2, "M", 2).svg).not.toBe(old);
    expect(renderAssetSvg(spec, kit, "M", 1).svg).toBe(old);
  });
});

describe("motion studio", () => {
  const m = MotionSpecSchema.parse({
    template: "service_stack",
    format: "story",
    headline: "What we do",
    items: ["Party jollof", "Small chops"],
    cta: "Order now",
    contact: "+2348012345678",
  });
  it("renders reproducible frames that actually animate", () => {
    const a = motionFrameSvg(m, kit, "Mama", 0.2).svg;
    expect(motionFrameSvg(m, kit, "Mama", 0.2).svg).toBe(a);
    expect(motionFrameSvg(m, kit, "Mama", 2.5).svg).not.toBe(a);
    const end = motionFrameSvg(m, kit, "Mama", 6.9).svg;
    expect(end).toContain("Party jollof");
    expect(end).toContain("Order now");
    expect(a).not.toContain("Order now");
  });
  it("computes frame counts and rejects out-of-range durations", () => {
    expect(frameCount(m)).toBe(168);
    expect(() => MotionSpecSchema.parse({ ...m, durationSec: 60 })).toThrow();
  });
});
