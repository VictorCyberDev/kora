/**
 * Creative Critic: structured, actionable defects instead of one misleading score. It judges a finished spec against
 * the brand, the business facts and the rules of the closed vocabulary. Safe repairs are applied by `repairV3`;
 * anything that needs taste or a fact is reported, never "fixed" by guessing.
 */
import {
  GRAMMARS,
  buildTruth,
  ctaLabel,
  findCliches,
  inventedNumbers,
  isGenericCta,
  resolveVertical,
} from "@kora/creative";
import { genomeDistance, avoidTags } from "@kora/creative";
import { wantsDock } from "./dock-policy.js";
import type { SectionV3, SiteSpecV3 } from "./spec.js";

export const DIMENSIONS = [
  "brandDistinctiveness",
  "businessFit",
  "conversionClarity",
  "hierarchy",
  "typography",
  "artDirection",
  "composition",
  "mobile",
  "accessibility",
  "performance",
  "truthfulness",
  "crossChannelConsistency",
  "contentCompleteness",
  "navigation",
  "mediaIntegrity",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface CriticIssue {
  code: string;
  severity: "block" | "warn" | "info";
  dimension: Dimension;
  message: string;
  repairable: boolean;
}

/** Everything a visitor can read, section by section. */
export function visibleTextV3(spec: SiteSpecV3): string[] {
  const out: string[] = [spec.seo.title, spec.seo.description];
  for (const p of spec.pages)
    for (const s of p.sections) {
      const a = s as unknown as Record<string, unknown>;
      for (const k of [
        "eyebrow",
        "heading",
        "subheading",
        "intro",
        "text",
        "body",
        "caption",
      ]) {
        const v = a[k];
        if (typeof v === "string") out.push(v);
        if (Array.isArray(v))
          out.push(...v.filter((x): x is string => typeof x === "string"));
      }
      if ("highlights" in s) out.push(...s.highlights);
      if ("items" in s && Array.isArray(s.items))
        for (const it of s.items as unknown as Array<Record<string, unknown>>)
          for (const k of [
            "title",
            "text",
            "tag",
            "price",
            "question",
            "answer",
            "caption",
          ])
            if (typeof it[k] === "string") out.push(it[k]);
      if ("quotes" in s) for (const q of s.quotes) out.push(q.quote);
      for (const c of [
        ("primaryCta" in s && s.primaryCta) || null,
        ("secondaryCta" in s && s.secondaryCta) || null,
        ("button" in s && s.button) || null,
      ])
        if (c) out.push(c.label);
    }
  return out.filter(Boolean);
}

const CARDS = new Set([
  "offer.image-tiles",
  "offer.board",
  "products.gallery-grid",
  "products.rail",
  "gallery.grid",
]);
const sectionKey = (s: SectionV3) => `${s.type}.${s.layout}`;

export interface CriticContext {
  /** Recent designs for this account (newest first), for the template-fatigue check. */
  recent?: Array<{
    grammarId: string;
    typeVoice: string;
    colorwayId: string;
    heroPhilosophy: string;
  }>;
}

export function criticV3(
  spec: SiteSpecV3,
  ctx: CriticContext = {},
): CriticIssue[] {
  const issues: CriticIssue[] = [];
  const add = (
    code: string,
    severity: CriticIssue["severity"],
    dimension: Dimension,
    message: string,
    repairable = false,
  ) => issues.push({ code, severity, dimension, message, repairable });
  const g = spec.design.genome;
  const b = spec.business;
  const home = spec.pages.find((p) => p.slug === "home")!;
  const text = visibleTextV3(spec);
  const joined = text.join(" \n ");

  // --- hierarchy & conversion
  const hero = home.sections[0];
  if (!hero || hero.type !== "hero")
    add(
      "HERO_WEAK_HIERARCHY",
      "block",
      "hierarchy",
      "The first thing on the home page is not a hero with one dominant message.",
    );
  else {
    if (hero.heading.length > 72)
      add(
        "HERO_WEAK_HIERARCHY",
        "warn",
        "hierarchy",
        `The hero headline is ${hero.heading.length} characters; one dominant message should be shorter.`,
      );
    if (!hero.primaryCta)
      add(
        "HERO_NO_ACTION",
        "warn",
        "conversionClarity",
        "The hero offers no action.",
      );
  }
  for (const p of spec.pages)
    for (const s of p.sections)
      for (const c of [
        ("primaryCta" in s && s.primaryCta) || null,
        ("secondaryCta" in s && s.secondaryCta) || null,
        ("button" in s && s.button) || null,
      ])
        if (c && isGenericCta(c.label))
          add(
            "CTA_TOO_GENERIC",
            "warn",
            "conversionClarity",
            `"${c.label}" is generic; name the real action.`,
            true,
          );

  // --- composition
  const cardRun = home.sections.filter((s) => CARDS.has(sectionKey(s))).length;
  if (cardRun >= 3)
    add(
      "TOO_MANY_CARD_GRIDS",
      "warn",
      "composition",
      `${cardRun} card-style sections on the home page.`,
    );
  const layouts = home.sections.map(sectionKey);
  if (layouts.some((k, i) => i > 0 && k === layouts[i - 1]))
    add(
      "REPEATED_SECTION",
      "warn",
      "composition",
      "Two identical layouts sit next to each other.",
    );
  if (
    g.radiusStyle === "pill" &&
    ["centered-classical", "monograph", "stacked-utility"].includes(
      g.compositionMode,
    )
  )
    add(
      "EXCESSIVE_RADIUS",
      "warn",
      "composition",
      "Pill radii undercut this composition's seriousness.",
      true,
    );

  // --- brand
  if (
    g.signatureMotif === "none" &&
    ["minimal-modernist", "local-commerce"].includes(g.typeVoice) &&
    g.paletteBehavior === "ink-on-paper"
  )
    add(
      "BRAND_TOO_GENERIC",
      "warn",
      "brandDistinctiveness",
      "No signature device and a neutral type voice: this reads as a default look.",
      true,
    );
  const treatments = new Set<string>();
  const sources = new Set<string>();
  for (const p of spec.pages)
    for (const s of p.sections) {
      const ms: Array<{
        treatment: string;
        provenance: { sourceType: string };
        alt: string;
      }> = [];
      const a = s as unknown as {
        media?: (typeof ms)[number];
        items?: Array<{ media?: (typeof ms)[number] }>;
      };
      if (a.media) ms.push(a.media);
      for (const it of a.items ?? []) if (it.media) ms.push(it.media);
      for (const m of ms) {
        treatments.add(m.treatment);
        sources.add(m.provenance.sourceType);
        if (!m.alt.trim())
          add(
            "IMAGE_ALT_MISSING",
            "warn",
            "accessibility",
            "An image has no alt text.",
          );
      }
    }
  if (treatments.size > 1)
    add(
      "IMAGE_STYLE_INCONSISTENT",
      "warn",
      "artDirection",
      "Images use different treatments on one site.",
    );
  if (sources.size > 1 && sources.has("owner-supplied"))
    add(
      "IMAGE_SOURCE_MIXED",
      "info",
      "artDirection",
      "Owner photos are mixed with stock; prefer the owner's own.",
    );

  // --- typography
  if (!GRAMMARS.some((x) => x.genome.typeVoice === g.typeVoice))
    add(
      "TYPE_PAIRING_WEAK",
      "info",
      "typography",
      "The type voice is not used by any Kora design language.",
    );

  // --- mobile
  const reach = !!(b.phone || b.whatsapp);
  const heroActs =
    hero?.type === "hero" &&
    [hero.primaryCta, hero.secondaryCta].some(
      (c) => c && /^(tel:|https:\/\/wa\.me)/.test(c.href),
    );
  if (reach && !heroActs && !wantsDock(spec))
    add(
      "MOBILE_ACTION_BURIED",
      "warn",
      "mobile",
      "Phone or WhatsApp exists but no first-screen action or action dock reaches it.",
    );

  // --- truthfulness
  for (const w of findCliches(joined))
    add("COPY_CLICHE", "warn", "truthfulness", `Generic phrase: "${w}".`);
  const truth = buildTruth({
    name: b.name,
    description: b.description || "—".repeat(12),
    ...(b.location ? { location: b.location } : {}),
    ...(b.phone ? { phone: b.phone } : {}),
    ...(b.whatsapp ? { whatsapp: b.whatsapp } : {}),
    ...(b.hours.length ? { hours: b.hours } : {}),
    services: home.sections
      .flatMap((s) =>
        s.type === "offer" || s.type === "products"
          ? s.items.map((i) => i.title)
          : [],
      )
      .slice(0, 12),
  });
  const supplied = [...truth.suppliedNumbers];
  const priced = home.sections.flatMap((s) =>
    s.type === "offer" || s.type === "products"
      ? s.items.map((i) => i.price ?? "")
      : [],
  );
  for (const pr of priced)
    for (const d of pr.match(/\d+/g) ?? []) supplied.push(d);
  const trueTruth = { ...truth, suppliedNumbers: supplied };
  const proofText = spec.pages.flatMap((p) =>
    p.sections.flatMap((s) =>
      s.type === "proof"
        ? [
            ...s.quotes.map((q) => q.quote),
            ...s.facts.flatMap((f) => [f.value, f.label]),
          ]
        : [],
    ),
  );
  for (const n of inventedNumbers(
    text.filter((t) => !proofText.includes(t)).join(" \n "),
    trueTruth,
  ))
    add(
      "INVENTED_NUMBER",
      "block",
      "truthfulness",
      `"${n}" is a figure the owner never supplied.`,
    );
  if (
    /\b(award[- ]winning|certified|accredited|guarantee[d]?|since \d{4}|years of experience|\d+\+? (clients|customers|projects))\b/i.test(
      joined,
    ) &&
    !proofText.length
  )
    add(
      "UNSUPPORTED_CLAIM",
      "block",
      "truthfulness",
      "Copy makes an authority claim with no supplied proof behind it.",
    );
  for (const p of spec.pages)
    for (const s of p.sections) {
      const a = s as unknown as {
        media?: { provenance: { sourceType: string; reviewStatus: string } };
        items?: Array<{
          media?: { provenance: { sourceType: string; reviewStatus: string } };
        }>;
      };
      const ms = [a.media, ...(a.items ?? []).map((i) => i.media)].filter(
        Boolean,
      ) as Array<{ provenance: { sourceType: string; reviewStatus: string } }>;
      if (
        ms.some(
          (m) =>
            m.provenance.sourceType === "ai-generated" &&
            m.provenance.reviewStatus === "unreviewed",
        )
      )
        add(
          "MEDIA_UNREVIEWED",
          "block",
          "artDirection",
          "A generated image has not been approved by the owner.",
        );
    }

  // --- performance
  const imgs = spec.pages.reduce(
    (n, p) =>
      n +
      p.sections.reduce(
        (m, s) =>
          m +
          (("media" in s && s.media ? 1 : 0) +
            ("items" in s && Array.isArray(s.items)
              ? (s.items as Array<{ media?: unknown }>).filter((i) => i.media)
                  .length
              : 0)),
        0,
      ),
    0,
  );
  if (imgs > 24)
    add(
      "IMAGE_HEAVY",
      "warn",
      "performance",
      `${imgs} images across the site.`,
    );
  if (home.sections.length < 4)
    add(
      "THIN_PAGE",
      "info",
      "businessFit",
      "A short home page: honest, but consider adding supplied facts (hours, services, photos).",
    );

  // ---------------------------------------------------------------- creative-direction signals (warnings)
  const vert = resolveVertical(`${b.name} ${b.industry} ${b.description}`);
  const gram = GRAMMARS.find((x) => x.id === spec.brand.grammarId);
  const homePlates = home.sections.reduce(
    (n, sec) =>
      n +
      ("plate" in sec && sec.plate && !("media" in sec && sec.media) ? 1 : 0) +
      ("items" in sec && Array.isArray(sec.items)
        ? (sec.items as Array<{ plate?: unknown; media?: unknown }>).filter(
            (i) => i.plate && !i.media,
          ).length
        : 0),
    0,
  );
  const homePhotos = home.sections.reduce(
    (n, sec) =>
      n +
      ("media" in sec && sec.media ? 1 : 0) +
      ("items" in sec && Array.isArray(sec.items)
        ? (sec.items as Array<{ media?: unknown }>).filter((i) => i.media)
            .length
        : 0),
    0,
  );
  const PHOTO_NEEDING = new Set([
    "cinematic",
    "arch-portrait",
    "product-dominant",
    "collage",
    "editorial-split",
  ]);
  if (hero?.type === "hero" && !hero.media && PHOTO_NEEDING.has(hero.layout))
    add(
      "WEAK_HERO",
      "warn",
      "hierarchy",
      `The ${hero.layout} opening is built around a picture, but none is available; a typographic opening would be stronger.`,
    );
  if (vert.photoTrust && homePhotos === 0)
    add(
      "IMAGE_LED_VERTICAL_WITHOUT_STRONG_IMAGE",
      "warn",
      "artDirection",
      `${vert.label} is judged on real photographs and this design has none yet. Add photos to make it much stronger.`,
    );
  if (
    homePlates >= 4 ||
    (vert.photoTrust && homePlates >= 2 && homePhotos === 0)
  )
    add(
      "PROCEDURAL_ART_OVERUSED",
      "warn",
      "artDirection",
      `${homePlates} graphic placeholders stand in for pictures on the home page.`,
    );
  if (homePlates >= 3 && g.accentScarcity === "rare")
    add(
      "TOO_MUCH_GENERIC_DECORATION",
      "info",
      "composition",
      "Several placeholder graphics on a restrained brand read as decoration.",
    );
  if (spec.design.genome.imageDominance === "dominant" && homePhotos === 0)
    add(
      "WEAK_ART_DIRECTION",
      "warn",
      "artDirection",
      "The design promises picture-led composition but carries no pictures.",
    );
  if (
    ["minimal-modernist", "local-commerce", "friendly-humanist"].includes(
      g.typeVoice,
    ) &&
    g.headlineBehavior === "sentence" &&
    g.typeContrast !== "extreme" &&
    g.typeContrast !== "high"
  )
    add(
      "TYPE_HAS_NO_CHARACTER",
      "info",
      "typography",
      "A neutral type voice with plain headlines gives the brand no typographic personality.",
    );
  if (
    g.signatureMotif === "none" &&
    !home.sections.some((x) => x.type === "ticker" || x.type === "statement")
  )
    add(
      "NO_SIGNATURE_MOMENT",
      "info",
      "brandDistinctiveness",
      "No recurring device or standout moment makes this design recognisable.",
    );
  const cardLike = home.sections.filter((x) => CARDS.has(sectionKey(x)));
  if (
    cardLike.length >= 2 &&
    home.sections.findIndex((x) => CARDS.has(sectionKey(x))) + 1 ===
      home.sections.findIndex(
        (x, i) =>
          i > 0 &&
          CARDS.has(sectionKey(x)) &&
          CARDS.has(sectionKey(home.sections[i - 1]!)),
      )
  )
    add(
      "REPETITIVE_CARD_GRID",
      "warn",
      "composition",
      "Two card grids sit back to back.",
    );
  const families = home.sections.map((x) => x.type);
  if (new Set(families).size < Math.min(4, families.length - 1))
    add(
      "SECTIONS_TOO_SIMILAR",
      "warn",
      "composition",
      "The home page repeats the same kind of section.",
    );
  const n = home.sections.length;
  if ((g.density === "airy" && n > 10) || (g.density === "dense" && n < 3))
    add(
      "UNBALANCED_DENSITY",
      "info",
      "composition",
      `${n} sections does not match the ${g.density} density this design promises.`,
    );
  if (gram) {
    const clash = gram.tags.filter((tg) => avoidTags(vert.antiTraits).has(tg));
    if (clash.length)
      add(
        "BUSINESS_FIT_WEAK",
        "warn",
        "businessFit",
        `This look (${clash.join(", ")}) is something ${vert.label.toLowerCase()} designs should avoid.`,
      );
  }
  if (
    (vert.primaryIntent === "call" || vert.primaryIntent === "whatsapp") &&
    (b.phone || b.whatsapp) &&
    hero?.type === "hero" &&
    !wantsDock(spec)
  )
    add(
      "POOR_MOBILE_PRIORITY",
      "warn",
      "mobile",
      "People mostly call or message this kind of business, but the phone layout has no persistent action.",
    );
  if (ctx.recent?.length) {
    const last2 = ctx.recent.slice(0, 2);
    if (
      last2.some(
        (r) =>
          r.grammarId === spec.brand.grammarId && r.typeVoice === g.typeVoice,
      )
    )
      add(
        "TOO_SIMILAR_TO_RECENT_DIRECTION",
        "warn",
        "brandDistinctiveness",
        "This design language and typeface were used in a recent design for this account.",
      );
  }
  return issues;
}

export function gradeByDimension(
  issues: CriticIssue[],
): Record<Dimension, { status: "ok" | "warn" | "block"; issues: string[] }> {
  const out = Object.fromEntries(
    DIMENSIONS.map((d) => [d, { status: "ok", issues: [] as string[] }]),
  ) as Record<Dimension, { status: "ok" | "warn" | "block"; issues: string[] }>;
  for (const i of issues) {
    const o = out[i.dimension];
    if (i.severity === "block") o.status = "block";
    else if (i.severity === "warn" && o.status !== "block") o.status = "warn";
    o.issues.push(i.code);
  }
  return out;
}

/** Applies only repairs that do not change meaning or require a fact. Returns a new spec; the input is untouched. */
export function repairV3(spec: SiteSpecV3): {
  spec: SiteSpecV3;
  applied: string[];
} {
  const next = structuredClone(spec);
  const applied: string[] = [];
  const v = resolveVertical(
    `${next.business.name} ${next.business.industry} ${next.business.description}`,
  );
  const g = next.design.genome;
  for (const p of next.pages)
    for (const s of p.sections)
      for (const c of [
        ("primaryCta" in s && s.primaryCta) || null,
        ("secondaryCta" in s && s.secondaryCta) || null,
        ("button" in s && s.button) || null,
      ])
        if (c && isGenericCta(c.label)) {
          const better = /^tel:/.test(c.href)
            ? "Call us"
            : /wa\.me/.test(c.href)
              ? ctaLabel(v.id, "whatsapp")
              : ctaLabel(v.id, v.primaryIntent);
          if (!isGenericCta(better)) {
            c.label = better;
            applied.push("CTA_TOO_GENERIC");
          }
        }
  if (criticV3(spec).some((i) => i.code === "EXCESSIVE_RADIUS")) {
    g.radiusStyle = "slight";
    applied.push("EXCESSIVE_RADIUS");
  }
  if (criticV3(spec).some((i) => i.code === "BRAND_TOO_GENERIC")) {
    const gram = GRAMMARS.find((x) => x.id === next.brand.grammarId);
    const motif = gram?.alternates.motif.find((m) => m !== "none");
    if (motif) {
      g.signatureMotif = motif;
      applied.push("BRAND_TOO_GENERIC");
    }
  }
  return { spec: next, applied };
}

// ------------------------------------------------------------------ anti-sameness
const heroKey = (s: SiteSpecV3) => {
  const h = s.pages.find((p) => p.slug === "home")!.sections[0];
  return h && h.type === "hero" ? `${h.layout}.${h.variant}` : "none";
};
const SEQ = (s: SiteSpecV3) =>
  s.pages.find((p) => p.slug === "home")!.sections.map(sectionKey);
function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
  return dp[a.length]![b.length]!;
}
/** 1 = indistinguishable structure, 0 = nothing in common. Weighs what a designer notices first. */
export function similarityV3(a: SiteSpecV3, b: SiteSpecV3): number {
  const ga = a.design.genome,
    gb = b.design.genome;
  const eq = (x: unknown, y: unknown) => (x === y ? 1 : 0);
  const sa = SEQ(a),
    sb = SEQ(b);
  const seq = lcs(sa, sb) / Math.max(sa.length, sb.length, 1);
  const parts: Array<[number, number]> = [
    [3, eq(heroKey(a), heroKey(b))],
    [2, eq(ga.headerStyle, gb.headerStyle)],
    [3, seq],
    [3, eq(ga.typeVoice, gb.typeVoice)],
    [2, eq(ga.paletteBehavior, gb.paletteBehavior)],
    [2, eq(a.design.mode, b.design.mode)],
    [1, eq(ga.radiusStyle, gb.radiusStyle)],
    [2, eq(ga.servicePresentation, gb.servicePresentation)],
    [1, eq(ga.signatureMotif, gb.signatureMotif)],
    [2, 1 - genomeDistance(ga, gb)],
    [1, eq(a.design.palette.primary, b.design.palette.primary)],
  ];
  const w = parts.reduce((n, [x]) => n + x, 0);
  return parts.reduce((n, [x, v]) => n + x * v, 0) / w;
}

export function diversityReport(specs: SiteSpecV3[]): {
  max: number;
  mean: number;
  worst: [number, number] | null;
  matrix: number[][];
} {
  const matrix = specs.map((a) =>
    specs.map((b) => Math.round(similarityV3(a, b) * 100) / 100),
  );
  let max = 0,
    sum = 0,
    n = 0,
    worst: [number, number] | null = null;
  for (let i = 0; i < specs.length; i++)
    for (let j = i + 1; j < specs.length; j++) {
      const s = matrix[i]![j]!;
      sum += s;
      n++;
      if (s > max) {
        max = s;
        worst = [i, j];
      }
    }
  return { max, mean: n ? sum / n : 0, worst, matrix };
}

/**
 * Does a creative (flyer, post, story) still belong to the website's brand? Compares the identity-carrying fields only:
 * palette, type voice, signature device and brand version. An artifact made under an earlier brand version is reported
 * as an informational note (it is historical, not wrong).
 */
export function crossChannelDrift(
  spec: SiteSpecV3,
  art: {
    brand: {
      osVersion: number;
      osHash: string;
      typeVoice: string;
      signatureMotif: string;
      palette: { primary: string; background: string; accent: string };
    };
  },
): CriticIssue[] {
  const out: CriticIssue[] = [];
  const g = spec.design.genome;
  const p = spec.design.palette;
  const drift = (what: string) =>
    out.push({
      code: "CROSS_CHANNEL_DRIFT",
      severity: "warn",
      dimension: "crossChannelConsistency",
      message: `${what} differs between the website and this creative.`,
      repairable: false,
    });
  if (art.brand.typeVoice !== g.typeVoice) drift("The typeface");
  if (art.brand.signatureMotif !== g.signatureMotif)
    drift("The signature device");
  if (
    art.brand.palette.primary.toLowerCase() !== p.primary.toLowerCase() ||
    art.brand.palette.background.toLowerCase() !== p.background.toLowerCase() ||
    art.brand.palette.accent.toLowerCase() !== p.accent.toLowerCase()
  )
    drift("The colour palette");
  if (!out.length && art.brand.osHash !== spec.brand.osHash)
    out.push({
      code: "BRAND_VERSION_DIFFERS",
      severity: "info",
      dimension: "crossChannelConsistency",
      message: `This creative was made with brand version ${art.brand.osVersion}; the website uses version ${spec.brand.osVersion}.`,
      repairable: false,
    });
  return out;
}
