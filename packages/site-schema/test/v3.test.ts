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
  applyStructuredEditV3,
  inferBrandOs,
  finalizeForPublish,
  planDirections,
  generateSpecFromBrief,
  parseSiteSpec,
  ruleBasedEditV3,
  EditV3Error,
} from "../src/index.js";
import {
  composeDirections,
  brandOsHash as brandOsHashOf,
} from "@kora/creative";

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

describe("type voices stay in step between website and artifacts", () => {
  it("VOICE_FAMILIES (artifacts) matches the website font table", async () => {
    const { VOICE_FAMILIES } = await import("@kora/creative");
    const { VOICES } = await import("../src/index.js");
    for (const [id, v] of Object.entries(VOICES)) {
      expect(
        VOICE_FAMILIES[id as keyof typeof VOICE_FAMILIES].display,
        id,
      ).toBe(v.display.family);
      expect(VOICE_FAMILIES[id as keyof typeof VOICE_FAMILIES].body, id).toBe(
        v.body.family,
      );
    }
  });
});

describe("composition follows the assets", () => {
  const fashion = {
    name: "Ife Studio",
    description:
      "A womenswear boutique making ready-to-wear dresses with African prints.",
    whatsapp: "+2348023232323",
    services: ["Ready-to-wear dresses", "Custom orders"],
    feel: "elegant editorial",
  };
  const photo = (
    id: string,
    o: Partial<{
      score: number;
      heroReady: boolean;
      flags: string[];
      role: string;
    }> = {},
  ) => ({
    id,
    role: o.role ?? "product",
    url: `https://media.test.example/api/public/sites/s/m/${id.padEnd(64, "a")}/w1280.webp`,
    srcset: [
      {
        url: `https://media.test.example/api/public/sites/s/m/${id.padEnd(64, "a")}/w640.webp`,
        width: 640,
      },
    ],
    alt: "",
    width: 1800,
    height: 1200,
    focal: { x: 0.4, y: 0.5 },
    quality: {
      score: o.score ?? 90,
      heroReady: o.heroReady ?? true,
      orientation: "landscape" as const,
      flags: o.flags ?? [],
    },
  });
  const hero = (opts?: Parameters<typeof planDirectionsV3>[1]) =>
    planDirectionsV3(fashion, opts).directions.map(
      (d) => d.spec.pages[0]!.sections[0]!,
    );
  it("no pictures: image-led brands go typographic or graphic; strong owner photos make them photo-led", () => {
    const without = hero();
    const withPhotos = hero({
      ownerPhotos: [photo("a1"), photo("b2"), photo("c3")],
    });
    const photoLed = (h: ReturnType<typeof hero>[number]) =>
      h.type === "hero" && !!h.media;
    expect(withPhotos.filter(photoLed).length).toBeGreaterThan(
      without.filter(photoLed).length,
    );
    for (const h of withPhotos)
      if (h.type === "hero" && h.media)
        expect(h.media.provenance.sourceType).toBe("owner-supplied");
  });
  it("a weak picture is never the hero: blurry and low-score pictures are skipped, low-resolution ones are not heroes", () => {
    const weak = [
      photo("d4", {
        score: 30,
        heroReady: false,
        flags: ["BLURRY", "LOW_RESOLUTION"],
      }),
      photo("e5", { score: 55, heroReady: false, flags: ["LOW_RESOLUTION"] }),
    ];
    const specs = planDirectionsV3(fashion, {
      ownerPhotos: weak,
    }).directions.map((d) => d.spec);
    for (const s of specs) {
      const h = s.pages[0]!.sections[0]!;
      expect((h.type === "hero" && h.media?.url) || "").not.toContain("d4");
      expect((h.type === "hero" && h.media?.url) || "").not.toContain("e5");
      expect(JSON.stringify(s)).not.toContain("d4".padEnd(64, "a"));
    }
  });
  it("focal point and responsive variants reach the HTML; owner media is described for accessibility", () => {
    const d = planDirectionsV3(fashion, {
      ownerPhotos: [photo("f6"), photo("g7"), photo("h8")],
    }).directions[0]!;
    const files = renderSiteV3(d.spec, ctx);
    const html = files["index.html"]!;
    expect(html).toMatch(/srcset="[^"]+ 640w/);
    expect(html).toMatch(/fp-40-50/);
    expect(files["styles.css"]).toContain(
      ".fp-40-50 img{object-position:40% 50%}",
    );
    expect(html).not.toMatch(/<img[^>]+alt=""/);
    expect(lintArtifact(files)).toEqual([]);
  });
  it("an owner logo replaces the typographic wordmark and is part of the brand", () => {
    const logo = {
      id: "logo-1",
      url:
        "https://media.test.example/api/public/sites/s/m/" +
        "b".repeat(64) +
        "/logo.png",
      alt: "",
      width: 600,
      height: 200,
    };
    const d = planDirectionsV3(fashion, { ownerLogo: logo }).directions[0]!;
    const html = renderSiteV3(d.spec, ctx)["index.html"]!;
    expect(html).toContain('class="logo"');
    expect(html).toContain('alt="Ife Studio logo"');
    expect(d.spec.business.logo?.assetId).toBe("logo-1");
    const plain = planDirectionsV3(fashion).directions[0]!;
    expect(d.brandOs.visual.logoAssetId).toBe("logo-1");
    expect(brandOsHashOf(d.brandOs)).not.toBe(brandOsHashOf(plain.brandOs));
  });
});

describe("owner-friendly design nudges", () => {
  const base = () => planDirectionsV3(barber).directions[0]!.spec;
  it("maps everyday words to validated edits", () => {
    for (const [t, n] of [
      ["make it warmer", "warmer"],
      ["a bit darker please", "darker"],
      ["more editorial", "editorial"],
      ["focus on the products", "product-focused"],
      ["keep it minimal", "minimal"],
      ["make it lighter", "lighter"],
    ] as const)
      expect(ruleBasedEditV3(t)).toEqual({ kind: "nudge", nudge: n });
  });
  it("palette nudges move within the design language and keep text legible", () => {
    const spec = base();
    let moved = 0;
    for (const n of ["warmer", "cooler", "darker", "lighter"] as const) {
      try {
        const out = applyStructuredEditV3(spec, { kind: "nudge", nudge: n });
        expect(out.design.colorwayId).not.toBe(spec.design.colorwayId);
        expect(out.brand.grammarId).toBe(spec.brand.grammarId);
        expect(criticV3(out).filter((i) => i.severity === "block")).toEqual([]);
        moved++;
      } catch (e) {
        // honest refusal when the language has nothing warmer/darker; never a bent brand
        expect(e).toBeInstanceOf(EditV3Error);
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(spec.design.colorwayId).toBe(base().design.colorwayId);
  });
  it("structure nudges change the genome and never the facts", () => {
    const spec = base();
    for (const n of ["editorial", "product-focused", "minimal"] as const) {
      const out = applyStructuredEditV3(spec, { kind: "nudge", nudge: n });
      expect(out.business).toEqual(spec.business);
      expect(out.design.genome).not.toEqual(spec.design.genome);
      expect(() => parseSiteSpecV3(out)).not.toThrow();
    }
  });
});

describe("Brand OS backfill for older sites", () => {
  it("reads colours and type from a v2 site and marks the result inferred", () => {
    const v2 = planDirections(barber)[0]!.spec;
    const { brandOs } = inferBrandOs(v2, { versionId: "v-1" });
    expect(brandOs.provenance.createdBy).toBe("inferred-from-site");
    expect(brandOs.provenance.inferred?.fromSpecVersion).toBe(2);
    expect(brandOs.provenance.inferred?.fromVersionId).toBe("v-1");
    expect(brandOs.visual.palette.primary).toBe(v2.design.palette.primary);
    expect(brandOs.visual.palette.background).toBe(
      v2.design.palette.background,
    );
    expect(brandOs.name).toBe(barber.name);
    expect(brandOs.version).toBe(1);
  });
  it("reads a v1 site's own two colours and never invents others as facts", () => {
    const v1 = parseSiteSpec(
      generateSpecFromBrief({
        name: barber.name,
        description: barber.description,
        whatsapp: barber.whatsapp,
      }),
    );
    const { brandOs } = inferBrandOs(v1);
    expect(brandOs.visual.palette.primary).toBe(v1.brand.primaryColor);
    expect(brandOs.visual.palette.accent).toBe(v1.brand.accentColor);
    expect(brandOs.provenance.inferred?.fromSpecVersion).toBe(1);
    expect(brandOs.provenance.inferred?.unknown).toContain("your logo");
    expect(brandOs.visual.logoAssetId).toBeNull();
  });
  it("is deterministic", () => {
    const v2 = planDirections(law)[0]!.spec;
    expect(brandOsHashOf(inferBrandOs(v2).brandOs)).toBe(
      brandOsHashOf(inferBrandOs(v2).brandOs),
    );
  });
});

describe("social preview, structured data, sitemap and robots stay factual", () => {
  const ph = (id: string) => ({
    id,
    role: "product",
    url: `https://media.test.example/api/public/sites/s/m/${id.padEnd(64, "a")}/w1280.webp`,
    srcset: [] as Array<{ url: string; width: number }>,
    alt: "A fade in progress",
    width: 1800,
    height: 1200,
    focal: { x: 0.5, y: 0.5 },
    quality: {
      score: 92,
      heroReady: true,
      orientation: "landscape" as const,
      flags: [] as string[],
    },
  });
  const ld = (html: string) => {
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(
      html,
    )!;
    return JSON.parse(m[1]!) as Record<string, unknown>;
  };
  it("with no picture of the business there is no og:image and the card is plain", () => {
    const html = renderSiteV3(planDirectionsV3(law).directions[0]!.spec)[
      "index.html"
    ]!;
    // stock photos are bundled relative paths; with no known origin they are not advertised
    expect(html).not.toContain("og:image");
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(ld(html).image).toBeUndefined();
  });
  it("an owner hero photo becomes the social picture, with its description and size", () => {
    const d = planDirectionsV3(barber, {
      ownerPhotos: [ph("p1"), ph("p2"), ph("p3")],
    }).directions.find((x) => {
      const h = x.spec.pages[0]!.sections[0]!;
      return h.type === "hero" && h.media;
    });
    expect(d).toBeDefined();
    if (!d) return;
    const html = renderSiteV3(d.spec)["index.html"]!;
    expect(html).toMatch(
      /property="og:image" content="https:\/\/media\.test\.example\//,
    );
    expect(html).toContain(
      'property="og:image:alt" content="A fade in progress"',
    );
    expect(html).toContain('property="og:image:width" content="1800"');
    expect(html).toContain('content="summary_large_image"');
    expect(ld(html).image).toMatch(/^https:\/\/media\.test\.example\//);
  });
  it("structured data contains only facts the owner supplied and cannot break out of the script tag", () => {
    const spec = planDirectionsV3({
      ...barber,
      name: "Fade </script><script>alert(1)</script> Lab",
    }).directions[0]!.spec;
    const html = renderSiteV3(spec)["index.html"]!;
    expect(html.match(/<script type="application\/ld\+json">/g)).toHaveLength(
      1,
    );
    const data = ld(html);
    expect(data["@type"]).toBe("LocalBusiness");
    expect(data.telephone).toBe(barber.phone);
    for (const k of [
      "aggregateRating",
      "review",
      "priceRange",
      "openingHours",
      "award",
    ])
      expect(data[k]).toBeUndefined();
    expect(html).not.toContain("</script><script>alert");
  });
  it("sitemap and robots list the real pages for the real origin only", () => {
    const spec = planDirectionsV3(barber).directions[0]!.spec;
    const files = finalizeForPublish(
      renderSiteV3(spec),
      spec,
      "https://fadelab.example/",
    );
    expect(files["robots.txt"]).toContain(
      "Sitemap: https://fadelab.example/sitemap.xml",
    );
    const locs = [
      ...files["sitemap.xml"]!.matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((m) => m[1]);
    expect(locs[0]).toBe("https://fadelab.example/");
    expect(locs.length).toBe(spec.pages.length);
    for (const l of locs) expect(l).toMatch(/^https:\/\//);
  });
});
