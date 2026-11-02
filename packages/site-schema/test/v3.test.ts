/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { describe, expect, it } from "vitest";
import {
  hashSpec,
  lintArtifact,
  parseAnySiteSpec,
  renderAnySite,
  specVersionOf,
  parseSiteSpecV3,
  planDirectionsV3,
  renderSiteV3,
  criticV3,
  repairV3,
  diversityReport,
  similarityV3,
  gradeByDimension,
  planSiteV3,
  sectionV3Schema,
} from "../src/index.js";
import { composeDirections } from "@kora/creative";

const barber = {
  name: "Fade Lab",
  description:
    "We focus on clean fades and beard grooming in Lekki. We want more bookings.",
  goal: "bookings" as const,
  location: "Lekki, Lagos",
  phone: "+2348012345678",
  whatsapp: "+2348012345678",
  services: ["Clean fades", "Beard grooming", "Kids cuts"],
  hours: [{ days: "Mon–Sat", hours: "9am–8pm" }],
};
const law = {
  name: "Adeyemi & Co",
  description: "We are a corporate law firm focused on commercial disputes.",
  location: "Victoria Island, Lagos",
  phone: "+2348055555555",
  email: "hello@adeyemi.example",
  services: ["Commercial disputes", "Arbitration", "Contract review"],
};
const cake = {
  name: "Tola's Cakes",
  description:
    "I sell birthday cakes from home. I only have my WhatsApp and three phone photos.",
  whatsapp: "+2348099999999",
};
const ctx = { formEndpoint: "https://kora.example/api/public/sites/s1/forms" };

describe("SiteSpec v3 routing and history", () => {
  it("routes by version and never reinterprets v1/v2", () => {
    expect(specVersionOf({ version: 3 })).toBe(3);
    expect(specVersionOf({ version: 2 })).toBe(2);
    expect(specVersionOf({})).toBe(1);
    const { directions } = planDirectionsV3(barber);
    const spec = directions[0]!.spec;
    expect(parseAnySiteSpec(JSON.parse(JSON.stringify(spec))).version).toBe(3);
    expect(renderAnySite(spec, ctx)["index.html"]).toContain("<!doctype html>");
  });
  it("is deterministic: same brief -> byte-identical spec hash and files", () => {
    const a = planDirectionsV3(barber).directions[0]!.spec;
    const b = planDirectionsV3(barber).directions[0]!.spec;
    expect(hashSpec(a)).toBe(hashSpec(b));
    expect(renderSiteV3(a, ctx)).toEqual(renderSiteV3(b, ctx));
  });
  it("a content edit does not redesign: changing the phone leaves the genome and palette alone", () => {
    const d = composeDirections(barber)[0]!;
    const a = planSiteV3(barber, d).spec;
    const b = planSiteV3({ ...barber, phone: "+2348099990000" }, d).spec;
    expect(b.design).toEqual(a.design);
    expect(b.brand.osHash).toBe(a.brand.osHash);
  });
});

describe("generation", () => {
  for (const [label, brief] of [
    ["barber", barber],
    ["law", law],
    ["cake", cake],
  ] as const)
    it(`${label}: three valid, lint-clean, genuinely different sites`, () => {
      const { directions } = planDirectionsV3(brief);
      expect(directions).toHaveLength(3);
      for (const d of directions) {
        const files = renderSiteV3(d.spec, ctx);
        expect(lintArtifact(files)).toEqual([]);
        expect(files["index.html"]).toContain(
          d.spec.business.name.replace(/&/g, "&amp;").replace(/'/g, "&#39;"),
        );
        expect(criticV3(d.spec).filter((i) => i.severity === "block")).toEqual(
          [],
        );
      }
      const sims = [
        similarityV3(directions[0]!.spec, directions[1]!.spec),
        similarityV3(directions[0]!.spec, directions[2]!.spec),
        similarityV3(directions[1]!.spec, directions[2]!.spec),
      ];
      for (const s of sims) expect(s).toBeLessThan(0.6);
    });
  it("minimal brief (name, phone, a sentence) still produces a useful first output", () => {
    const { directions } = planDirectionsV3({
      name: "Kemi Fabrics",
      description: "We sell ankara and lace fabrics in Ibadan.",
      phone: "+2348011112222",
    });
    const spec = directions[0]!.spec;
    expect(spec.pages[0]!.sections.length).toBeGreaterThanOrEqual(3);
    expect(spec.pages[0]!.sections[0]!.type).toBe("hero");
  });
});

describe("truthfulness", () => {
  it("never fabricates proof, prices, hours or years", () => {
    for (const brief of [barber, law, cake])
      for (const d of planDirectionsV3(brief).directions) {
        const types = d.spec.pages.flatMap((p) =>
          p.sections.map((s) => s.type),
        );
        expect(types).not.toContain("proof");
        const html = Object.values(renderSiteV3(d.spec, ctx)).join("\n");
        expect(html).not.toMatch(
          /₦\s?\d|\$\s?\d|\b(19|20)\d{2}\b.*since|since (19|20)\d{2}|rated|stars?\b/i,
        );
      }
  });
  it("proof appears only when supplied, and the schema makes invented proof unrepresentable", () => {
    const withQuotes = planDirectionsV3(barber, {
      quotes: [{ quote: "Best fade I have had.", author: "A. Customer" }],
    }).directions[0]!.spec;
    expect(
      withQuotes.pages
        .flatMap((p) => p.sections)
        .some((s) => s.type === "proof"),
    ).toBe(true);
    expect(
      sectionV3Schema.safeParse({
        type: "proof",
        layout: "stack",
        heading: "",
        quotes: [{ quote: "x", author: "y" }],
      }).success,
    ).toBe(false);
  });
  it("the critic blocks invented figures and unsupported authority claims", () => {
    const spec = structuredClone(planDirectionsV3(law).directions[0]!.spec);
    const hero = spec.pages[0]!.sections[0]!;
    if (hero.type === "hero")
      hero.subheading = "Award-winning firm with 250 happy clients since 2009.";
    const codes = criticV3(spec).map((i) => i.code);
    expect(codes).toContain("INVENTED_NUMBER");
    expect(codes).toContain("UNSUPPORTED_CLAIM");
  });
  it("generic copy and CTAs are detected and the CTA is repaired", () => {
    const spec = structuredClone(planDirectionsV3(barber).directions[0]!.spec);
    const hero = spec.pages[0]!.sections[0]!;
    if (hero.type === "hero") {
      hero.primaryCta = { label: "Get Started", href: hero.primaryCta!.href };
      hero.subheading = "Unlock your best look with world-class barbers.";
    }
    const issues = criticV3(spec);
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["CTA_TOO_GENERIC", "COPY_CLICHE"]),
    );
    const { spec: fixed, applied } = repairV3(spec);
    expect(applied).toContain("CTA_TOO_GENERIC");
    const h = fixed.pages[0]!.sections[0]!;
    expect(h.type === "hero" && h.primaryCta!.label).not.toBe("Get Started");
    expect(gradeByDimension(issues).truthfulness.status).toBe("warn");
  });
});

describe("closed vocabulary and safety", () => {
  const base = () =>
    structuredClone(
      planDirectionsV3(barber).directions[0]!.spec,
    ) as unknown as Record<string, any>;
  it("rejects unknown layouts, javascript: links, unsafe media and unregistered motion", () => {
    const a = base();
    a.pages[0].sections[0].layout = "wizard-hero";
    expect(() => parseSiteSpecV3(a)).toThrow();
    const b = base();
    b.pages[0].sections[0].primaryCta = {
      label: "x",
      href: "javascript:alert(1)",
    };
    expect(() => parseSiteSpecV3(b)).toThrow();
    const c = base();
    c.pages[0].sections[0].media = {
      url: "http://evil.example/x.png",
      alt: "x",
    };
    expect(() => parseSiteSpecV3(c)).toThrow();
    const d = base();
    d.design.genome.motionCharacter = "spin-forever";
    expect(() => parseSiteSpecV3(d)).toThrow();
    const e = base();
    e.design.genome.typeVoice = "comic-sans";
    expect(() => parseSiteSpecV3(e)).toThrow();
  });
  it("rejects a palette that fails contrast", () => {
    const a = base();
    a.design.palette.foreground = a.design.palette.background;
    expect(() => parseSiteSpecV3(a)).toThrow();
  });
  it("escapes injected markup in every text field", () => {
    const evil = {
      ...barber,
      name: "<img src=x onerror=alert(1)>Fade",
      description:
        'We cut "hair" <script>alert(1)</script> & more in Lekki today.',
      services: ["<b>Fades</b>", "Beard & <i>grooming</i>"],
    };
    for (const d of planDirectionsV3(evil).directions) {
      const files = renderSiteV3(d.spec, ctx);
      expect(lintArtifact(files)).toEqual([]);
      const html = files["index.html"]!;
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<script>alert");
    }
  });
  it("JSON-LD is escaped and carries only supplied facts", () => {
    const html = renderSiteV3(
      planDirectionsV3(barber).directions[0]!.spec,
      ctx,
    )["index.html"]!;
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(
      html,
    )!;
    const ld = JSON.parse(m[1]!);
    expect(ld["@type"]).toBe("LocalBusiness");
    expect(ld.telephone).toBe("+2348012345678");
    expect(ld.aggregateRating).toBeUndefined();
    expect(ld.openingHours).toBeUndefined();
  });
  it("never ships a form without an endpoint and keeps tracked-link JS identical to v2", () => {
    const spec = planDirectionsV3(barber).directions[0]!.spec;
    expect(Object.values(renderSiteV3(spec, {})).join("")).not.toContain(
      "<form",
    );
    expect(renderSiteV3(spec, ctx)["site.js"]).toContain("kora_k");
  });
});

describe("diversity", () => {
  const industries: Array<[string, Parameters<typeof planDirectionsV3>[0]]> = [
    ["barber", barber],
    ["law", law],
    ["cake", cake],
    [
      "clinic",
      {
        name: "Greenfield Clinic",
        description:
          "A family clinic offering check-ups and vaccinations in Port Harcourt.",
        phone: "+2348066666666",
      },
    ],
    [
      "plumber",
      {
        name: "QuickFix Plumbing",
        description:
          "We fix leaks, blocked drains and water heaters across Abuja.",
        phone: "+2348088888888",
      },
    ],
    [
      "photographer",
      {
        name: "Lens & Light",
        description:
          "Wedding and portrait photographer based in Lagos. Natural light, honest moments.",
        whatsapp: "+2348012121212",
        feel: "minimal quiet",
      },
    ],
    [
      "hotel",
      {
        name: "Palmview Hotel",
        description:
          "A boutique hotel with garden rooms and a restaurant near the Calabar waterfront.",
        whatsapp: "+2348034343434",
        feel: "luxury",
      },
    ],
    [
      "school",
      {
        name: "Little Steps Daycare",
        description:
          "A daycare and early learning centre for children aged one to five in Enugu.",
        phone: "+2348056565656",
      },
    ],
    [
      "saas",
      {
        name: "Ledgerly",
        description:
          "Ledgerly is accounting software for small shops that tracks sales, stock and debts in one place.",
        email: "hello@ledgerly.example",
      },
    ],
  ];
  it("cross-industry: no two industries share a design language", () => {
    const specs = industries.map(
      ([, b]) =>
        planDirectionsV3(b).directions.find((d) => d.recommended)!.spec,
    );
    const r = diversityReport(specs);
    expect(r.max).toBeLessThan(0.62);
    expect(
      new Set(specs.map((s) => s.design.genome.typeVoice)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(
      new Set(specs.map((s) => s.design.genome.heroPhilosophy)).size,
    ).toBeGreaterThanOrEqual(5);
  });
  it("same-industry: five bakeries are not one look", () => {
    const bakeries = [
      {
        name: "Crumb & Co",
        description:
          "Warm homemade sourdough and pastries for the neighbourhood.",
        feel: "warm",
        whatsapp: "+2348011111111",
      },
      {
        name: "Bold Buns",
        description:
          "Street-style doughnuts and bread for a young crowd, loud and fun.",
        feel: "bold street",
        whatsapp: "+2348022222222",
      },
      {
        name: "Maison Rêve",
        description: "Luxury bridal cakes and French pastries, made to order.",
        feel: "luxury elegant",
        whatsapp: "+2348033333333",
      },
      {
        name: "Little Sprinkles",
        description: "Bright cupcakes and cakes for kids' parties.",
        feel: "playful kids",
        whatsapp: "+2348044444444",
      },
      {
        name: "Green Acre Bakes",
        description: "Natural wholegrain bread and fresh farm pastries.",
        feel: "fresh natural",
        whatsapp: "+2348055555555",
      },
    ];
    const specs = bakeries.map((b) => planDirectionsV3(b).directions[0]!.spec);
    expect(diversityReport(specs).max).toBeLessThan(0.62);
    expect(
      new Set(specs.map((s) => s.design.genome.typeVoice)).size,
    ).toBeGreaterThanOrEqual(4);
  });
});

describe("owner situation is not public copy", () => {
  it("drops meta sentences and never shows directions for a home-based business", () => {
    const cake2 = {
      name: "Tola's Cakes",
      description:
        "I sell birthday cakes from home in Lekki. I only have my WhatsApp and three phone photos. We want more orders.",
      whatsapp: "+2348099999999",
      location: "Lekki, Lagos",
      services: ["Birthday cakes", "Cupcakes"],
    };
    for (const d of planDirectionsV3(cake2).directions) {
      const html = Object.values(renderSiteV3(d.spec, ctx)).join("\n");
      expect(html).not.toMatch(/phone photos|more orders|I only have/i);
      expect(html).not.toMatch(/Get directions|Find the bakery/);
      expect(d.spec.business.locationKind).toBe("service-area");
      expect(d.spec.pages.map((p) => p.slug)).not.toContain("visit");
    }
  });
  it("does not use a cafe interior as the picture of a home baker", () => {
    const spec = planDirectionsV3({
      name: "Tola's Cakes",
      description: "I sell birthday cakes from home in Lekki.",
      whatsapp: "+2348099999999",
    }).directions[0]!.spec;
    const alts = spec.pages.flatMap((p) =>
      p.sections.flatMap((s) =>
        "media" in s && s.media
          ? [s.media.alt]
          : "items" in s && Array.isArray(s.items)
            ? (s.items as Array<{ media?: { alt: string } }>).flatMap((i) =>
                i.media ? [i.media.alt] : [],
              )
            : [],
      ),
    );
    for (const a of alts)
      expect(a).not.toMatch(/interior|dining|tables?|window/i);
  });
});
