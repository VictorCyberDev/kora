import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySitePatch,
  artifactHash,
  checkMedia,
  catalogMediaFor,
  MEDIA_CATALOG,
  designQuality,
  designSignature,
  finalizeForPublish,
  fontFilesFor,
  generateSpecFromBrief,
  hashFiles,
  hashSpec,
  lintArtifact,
  parseAnySiteSpec,
  parseSiteSpecV2,
  planDirections,
  planSite,
  PAIRING_IDS,
  PALETTE_STRATEGY_IDS,
  buildPalette,
  contrast,
  renderAnySite,
  renderSite,
  renderSiteV2,
  RECIPES,
  LOOKS,
  VARIANTS,
  visibleText,
  type SiteSpecV2,
} from "../src/index.js";
import { BRIEFS } from "./fixtures/briefs.js";

const FONT_DIR = new URL("../../site-fonts/files/", import.meta.url);
const factsOf = (b: (typeof BRIEFS)[string]) => ({ text: JSON.stringify(b) });
const all = Object.entries(BRIEFS).flatMap(([key, b]) =>
  planDirections(b).map((d) => ({ key, d, b })),
);

describe("SiteSpec v1 is preserved", () => {
  // Golden hashes were produced by the code on main before the v2 work.
  const briefs = [
    {
      name: "Acme Plumbing",
      description:
        "We provide leak repairs, boiler servicing and bathroom fitting in Leeds.",
      phone: "+44 113 555 0100",
      location: "Leeds",
      hours: [{ days: "Mon–Fri", hours: "8–5" }],
    },
    {
      name: "Solo Coach",
      description: "I help founders plan their quarter.",
      email: "a@b.co",
    },
  ];
  const golden = [
    [
      "0c07f8275e152ba0701954fd898b5fa5bb42a29abe18ee9951b999bfafbf4a8a",
      "cda41f3eeb3e171a4e360c79785cd0e493820aea1237c837ae8e5f9e23840cb3",
      "75f7b7257f387ecbebf3bddaa526f8bb2f4482eae42795ba45f005a800b5205b",
    ],
    [
      "0f0a89bcb8c68565625ef1a85e076f03f2aec3323f75985aa216f2abc616fa60",
      "9aea41bb9238c0943f804c812791768db0f4f54858454cf07da447d67eee3b0a",
      "e2649afbd5696de62533282f28a9cedd4f4f197e8d6104ac97c2b06f3678b264",
    ],
  ] as const;
  it.each([0, 1])(
    "v1 spec, artifact and published hashes are byte-identical to pre-v2 main (%i)",
    (i) => {
      const spec = generateSpecFromBrief(briefs[i] as never);
      const files = renderAnySite(spec, {
        formEndpoint: "https://f.example/x",
      });
      expect(hashSpec(spec)).toBe(golden[i]![0]);
      expect(hashFiles(files)).toBe(golden[i]![1]);
      expect(
        hashFiles(finalizeForPublish(files, spec, "https://x.example/")),
      ).toBe(golden[i]![2]);
    },
  );
  it("dispatches by version and keeps patching v1 as v1", () => {
    const v1 = generateSpecFromBrief(briefs[0] as never);
    expect(parseAnySiteSpec(JSON.parse(JSON.stringify(v1))).version).toBe(1);
    expect(
      applySitePatch(v1, {
        ops: [{ op: "replace", path: "/business/name", value: "Acme Pipes" }],
      }).version,
    ).toBe(1);
    expect(renderAnySite(v1)).toEqual(renderSite(v1));
  });
});

describe("SiteSpec v2 schema", () => {
  const base = () => structuredClone<SiteSpecV2>(planSite(BRIEFS.repair!));
  it("accepts planner output and is JSON round-trip stable", () => {
    const s = base();
    expect(parseSiteSpecV2(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it.each([
    [
      "unknown component variant",
      (s: SiteSpecV2) => {
        (s.pages[0]!.sections[0] as { variant: string }).variant = "marquee-3d";
      },
    ],
    [
      "unreadable palette pair",
      (s: SiteSpecV2) => {
        s.design.palette.foreground = s.design.palette.background;
      },
    ],
    [
      "javascript link",
      (s: SiteSpecV2) => {
        (
          s.pages[0]!.sections[0] as {
            primaryCta?: { label: string; href: string };
          }
        ).primaryCta = { label: "x", href: "javascript:alert(1)" };
      },
    ],
    [
      "unknown font pairing",
      (s: SiteSpecV2) => {
        (s.design.typography as { pairing: string }).pairing = "Comic Sans";
      },
    ],
    [
      "http image",
      (s: SiteSpecV2) => {
        (s.pages[0]!.sections[0] as { media?: unknown }).media = {
          url: "http://x.example/a.png",
          alt: "x",
          source: "external",
        };
      },
    ],
    [
      "missing home page",
      (s: SiteSpecV2) => {
        s.pages[0]!.slug = "start";
      },
    ],
    [
      "dangling #anchor",
      (s: SiteSpecV2) => {
        (
          s.pages[0]!.sections[0] as {
            primaryCta?: { label: string; href: string };
          }
        ).primaryCta = { label: "Go", href: "#pricing" };
      },
    ],
    [
      "raw html field smuggled as colour",
      (s: SiteSpecV2) => {
        s.design.palette.primary = "red;}</style><script>";
      },
    ],
  ])("rejects %s", (_n, mutate) => {
    const s = base();
    mutate(s);
    expect(() => parseSiteSpecV2(s)).toThrow();
  });
  it("patches stay v2 and are re-validated", () => {
    const s = base();
    const ok = applySitePatch(s, {
      ops: [{ op: "replace", path: "/business/name", value: "Renamed Co" }],
    });
    expect(ok.version).toBe(2);
    expect(() =>
      applySitePatch(s, {
        ops: [{ op: "replace", path: "/version", value: 1 }],
      }),
    ).toThrow();
    expect(() =>
      applySitePatch(s, {
        ops: [{ op: "replace", path: "/design/nav", value: "evil" }],
      }),
    ).toThrow();
    expect(() =>
      applySitePatch(s, {
        ops: [
          {
            op: "replace",
            path: "/design/palette/primaryForeground",
            value: s.design.palette.primary,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("design system", () => {
  it.each(PALETTE_STRATEGY_IDS)(
    "palette %s meets WCAG AA for text pairs, for any hue shift",
    (id) => {
      for (const shift of [-12, 0, 12]) {
        const { palette: p } = buildPalette(id, shift);
        for (const [a, b] of [
          ["foreground", "background"],
          ["foreground", "surfaceRaised"],
          ["foreground", "surfaceMuted"],
          ["mutedForeground", "background"],
          ["mutedForeground", "surfaceMuted"],
          ["primaryForeground", "primary"],
          ["accentForeground", "accent"],
          ["secondaryForeground", "secondary"],
        ] as const)
          expect(
            contrast(p[a], p[b]),
            `${id}/${shift} ${a} on ${b}`,
          ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
  it("every font pairing references only bundled files and loads at most five", () => {
    for (const id of PAIRING_IDS) {
      const files = fontFilesFor(id);
      expect(files.length).toBeLessThanOrEqual(5);
      for (const f of files)
        expect(existsSync(new URL(f, FONT_DIR)), f).toBe(true);
    }
  });
  it("every look and recipe uses only registered variants and pairings", () => {
    for (const l of Object.values(LOOKS)) {
      expect(VARIANTS.hero).toContain(l.hero);
      expect(VARIANTS.nav).toContain(l.nav);
      expect(VARIANTS.footer).toContain(l.footer);
      expect(VARIANTS.services).toContain(l.services);
      expect(VARIANTS.contact).toContain(l.contact);
      expect(PAIRING_IDS).toContain(l.pairing);
    }
    for (const r of RECIPES)
      for (const id of r.looks)
        expect(LOOKS[id], `${r.id}:${id}`).toBeDefined();
    expect(RECIPES.length).toBeGreaterThanOrEqual(24);
    for (const r of RECIPES) {
      const looks = r.looks.map((id) => LOOKS[id]!);
      expect(new Set(looks.map((l) => l.hero)).size, `${r.id} heroes`).toBe(3);
      expect(new Set(r.colors).size, `${r.id} palettes`).toBe(3);
      expect(
        new Set(looks.map((l) => l.pairing)).size,
        `${r.id} type`,
      ).toBeGreaterThanOrEqual(2);
    }
    expect(
      new Set(Object.values(LOOKS).map((l) => l.hero)).size,
    ).toBeGreaterThanOrEqual(10);
  });
});

describe("deterministic planner and renderer", () => {
  it("same brief → identical spec and identical artifact hash", () => {
    const a = planSite(BRIEFS.interior!),
      b = planSite(BRIEFS.interior!);
    expect(hashSpec(a)).toBe(hashSpec(b));
    expect(artifactHash(renderSiteV2(a))).toBe(artifactHash(renderSiteV2(b)));
  });
  it.each(all.map((x) => [`${x.key}/${x.d.index}`, x] as const))(
    "%s renders a lint-clean, quality-clean site",
    (_n, { d, b }) => {
      const files = renderSiteV2(d.spec, {
        formEndpoint: "https://forms.example/s",
      });
      expect(lintArtifact(files)).toEqual([]);
      expect(designQuality(d.spec, factsOf(b))).toEqual([]);
      const html = files["index.html"]!;
      expect(html).toContain("font-src &#39;self&#39;");
      expect(html).toMatch(/<h1[ >]/);
      expect(html.match(/<h1[ >]/g)).toHaveLength(1);
      expect(files["styles.css"]).toContain("/_kora/fonts/");
      expect(html).not.toMatch(/\sstyle=/);
      expect(Object.values(files).join("").length).toBeLessThan(120_000);
    },
  );
  it("is an artifact with no script other than the bundled form handler", () => {
    const files = renderSiteV2(planSite(BRIEFS.saas!));
    expect(files["index.html"]!.match(/<script[^>]*>/g)).toEqual([
      '<script src="site.js" defer>',
    ]);
  });
});

describe("anti-fabrication", () => {
  it.each(all.map((x) => [`${x.key}/${x.d.index}`, x] as const))(
    "%s contains only facts from the brief",
    (_n, { d, b }) => {
      const sections = d.spec.pages.flatMap((p) =>
        p.sections.map((s) => s.type),
      );
      for (const banned of [
        "testimonials",
        "pricing",
        "stats",
        "team",
        "portfolio",
      ])
        expect(sections).not.toContain(banned);
      const spec = d.spec;
      if (!b.phone) expect(spec.business.phone).toBeUndefined();
      if (!b.email) expect(spec.business.email).toBeUndefined();
      if (!b.location) expect(spec.business.location).toBeUndefined();
      expect(spec.business.hours).toEqual(b.hours ?? []);
      const html = Object.entries(renderSiteV2(spec))
        .filter(([k]) => k.endsWith(".html"))
        .map(([, v]) => v)
        .join("\n");
      expect(html).not.toMatch(
        /\b(?:award|certified|years of experience|trusted by|guarantee|5-star|testimonial)/i,
      );
      // Every digit run shown to visitors comes from the owner (step numerals 01-04 are structural).
      const owner = JSON.stringify(b);
      for (const t of visibleText(spec))
        for (const n of t.match(/\d+/g) ?? [])
          expect(owner, `${n} in "${t}"`).toContain(n);
    },
  );
  it("the quality gate catches fabricated copy from any generator", () => {
    const s = structuredClone<SiteSpecV2>(planSite(BRIEFS.consultant!));
    const home = s.pages[0]!;
    home.sections.splice(
      1,
      0,
      {
        type: "stats",
        variant: "row",
        heading: "",
        items: [{ value: "500+", label: "happy clients" }],
      },
      {
        type: "testimonials",
        variant: "grid",
        heading: "",
        items: [{ quote: "Life changing", author: "A. Customer" }],
      },
    );
    (home.sections[0] as { subheading: string }).subheading =
      "Award-winning, world-class solutions that unlock growth since 2009";
    const rules = designQuality(s, factsOf(BRIEFS.consultant!)).map(
      (f) => f.rule,
    );
    expect(rules).toEqual(
      expect.arrayContaining([
        "cliche",
        "unsupported-claim",
        "invented-number",
        "fabrication",
      ]),
    );
  });
  it("escapes owner text everywhere", () => {
    const s = planSite({
      ...BRIEFS.repair!,
      name: `Fix <img src=x onerror=alert(1)> & "Co"`,
    });
    const files = renderSiteV2(s);
    expect(lintArtifact(files)).toEqual([]);
    expect(files["index.html"]).not.toContain("<img src=x");
  });
});

describe("diversity — ten sites must not share a skeleton", () => {
  const sigs = Object.entries(BRIEFS).map(
    ([k, b]) => [k, designSignature(planSite(b))] as const,
  );
  const distinct = (f: (s: ReturnType<typeof designSignature>) => string) =>
    new Set(sigs.map(([, s]) => f(s))).size;
  it("varies hero, nav, type, palette, footer and section order across the fixtures", () => {
    expect(distinct((s) => s.hero)).toBeGreaterThanOrEqual(7);
    expect(distinct((s) => s.nav)).toBeGreaterThanOrEqual(4);
    expect(distinct((s) => s.pairing)).toBeGreaterThanOrEqual(7);
    expect(distinct((s) => s.palette)).toBeGreaterThanOrEqual(8);
    expect(distinct((s) => s.footer)).toBeGreaterThanOrEqual(3);
    expect(distinct((s) => s.variants)).toBeGreaterThanOrEqual(10);
  });
  it("no two fixtures share the same hero + pairing + palette combination", () => {
    expect(distinct((s) => `${s.hero}|${s.pairing}|${s.palette}`)).toBe(
      sigs.length,
    );
  });
  it("the three directions for one business are genuinely different", () => {
    for (const [k, b] of Object.entries(BRIEFS)) {
      const d = planDirections(b).map((x) => designSignature(x.spec));
      expect(new Set(d.map((s) => s.hero)).size, k).toBe(3);
      expect(new Set(d.map((s) => s.palette)).size, k).toBe(3);
      expect(new Set(d.map((s) => s.pairing)).size, k).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});

describe("edge briefs", () => {
  it.each([
    [
      "one service only",
      {
        name: "Solo",
        description: "We provide car washing in Abuja and nearby areas.",
        goal: "show-work" as const,
      },
    ],
    ["no facts at all", { name: "X", description: "A small local shop." }],
    [
      "unicode and long names",
      {
        name: "Mamá Ñandú's Küche ☕ — Café & Bäckerei der Zukunft",
        description:
          "Wir backen Brot und Kuchen. We provide bread, cakes and coffee.",
      },
    ],
  ])("%s still yields a valid, lint-clean site", (_n, brief) => {
    for (const d of planDirections(brief)) {
      expect(lintArtifact(renderSiteV2(d.spec))).toEqual([]);
      expect(designQuality(d.spec, { text: JSON.stringify(brief) })).toEqual(
        [],
      );
    }
  });
});

describe("media", () => {
  it("any photograph is a catalogued, licensed, existing file with alt text; never anything else", () => {
    const ids = new Set(MEDIA_CATALOG.map((e) => e.file));
    for (const { d } of all) {
      const html = renderSiteV2(d.spec)["index.html"]!;
      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        const src = /src="([^"]+)"/.exec(m[0])![1]!;
        expect(src.startsWith("/_kora/media/"), src).toBe(true);
        expect(ids.has(src.slice("/_kora/media/".length)), src).toBe(true);
        expect(m[0]).toMatch(/alt="[^"]+"/);
      }
    }
  });
  it("the catalogue is complete: files exist, licensed, small, no brand signage claims", () => {
    const dir = new URL("../../site-media/files/", import.meta.url);
    expect(MEDIA_CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const e of MEDIA_CATALOG) {
      expect(existsSync(new URL(e.file, dir)), e.file).toBe(true);
      expect(statSync(new URL(e.file, dir)).size, e.file).toBeLessThan(260_000);
      expect(e.license).toBe("Pexels License");
      expect(e.sourceUrl).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);
      expect(e.alt.length).toBeGreaterThan(20);
    }
  });
  it("photographs are only used for businesses they honestly represent", () => {
    const fits = (recipe: string) => catalogMediaFor(recipe, "light");
    expect(fits("restaurant")).toBeDefined();
    expect(fits("electronics-repair")?.url).toContain("repair-bench");
    for (const r of [
      "law",
      "saas",
      "interior-design",
      "barber",
      "salon-beauty",
      "consultant-coach",
      "fitness-gym",
    ])
      expect(fits(r), r).toBeUndefined();
  });
  it("owner media must be https, described and credited when external", () => {
    expect(
      checkMedia({
        url: "https://x.example/a.jpg",
        alt: "A kitchen",
        source: "upload",
      }).ok,
    ).toBe(true);
    expect(
      checkMedia({
        url: "https://x.example/a.jpg",
        alt: "",
        source: "upload",
      }).problems.join(),
    ).toContain("alt");
    expect(
      checkMedia({
        url: "https://x.example/a.jpg",
        alt: "A kitchen",
        source: "external",
      }).ok,
    ).toBe(false);
  });
  it("supplied media renders with alt text, lazy loading and a focal class instead of an inline style", () => {
    const s = structuredClone<SiteSpecV2>(planSite(BRIEFS.interior!));
    (s.pages[0]!.sections[0] as { media?: unknown }).media = {
      url: "https://cdn.example/room.jpg",
      alt: "A lit living room",
      source: "upload",
      focalPoint: { x: 0.9, y: 0.1 },
    };
    const html = renderSiteV2(s)["index.html"]!;
    expect(html).toMatch(
      /<img src="https:\/\/cdn.example\/room.jpg" alt="A lit living room"[^>]*loading="lazy"[^>]*class="fp-rt"/,
    );
    expect(lintArtifact(renderSiteV2(s))).toEqual([]);
  });
});

describe("no look dominates the fixtures", () => {
  it("no single look is used by more than two of the fixture sites in direction A", () => {
    const count = new Map<string, number>();
    for (const b of Object.values(BRIEFS)) {
      const d = planDirections(b)[0]!;
      count.set(d.look, (count.get(d.look) ?? 0) + 1);
    }
    for (const [look, n] of count) expect(n, look).toBeLessThanOrEqual(2);
  });
});
