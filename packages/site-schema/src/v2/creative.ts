/**
 * Creative Quality System (M10/M11). Deterministic gates taken from the Phase 0 audit
 * (docs/design/audit-before/FINDINGS.md), a K0–K5 grade across six review perspectives, and a
 * similarity check so two businesses in one category do not come out as the same page.
 */
import { designQuality, designSignature, visibleText } from "./quality.js";
import type { SiteSpecV2 } from "./spec.js";

export const PERSPECTIVES = [
  "copy",
  "structure",
  "evidence",
  "visual",
  "conversion",
  "accessibility",
] as const;
export type Perspective = (typeof PERSPECTIVES)[number];

export interface CreativeFinding {
  rule: string;
  perspective: Perspective;
  severity: "block" | "warn";
  message: string;
}

export interface CreativeFacts {
  /** Everything the owner supplied, as one string (same convention as designQuality). */
  text?: string;
  /** Business category hint, e.g. "bakery". */
  industry?: string;
}

const FOOD =
  /bak|cake|pastr|restaurant|caterer|catering|kitchen|food|café|cafe|eatery/i;
const FOOD_WORDS =
  /cake|bread|loaf|loaves|pastr|croissant|cupcake|pie|doughnut|donut|sourdough|jollof|soup|stew|rice|grill|suya|menu|dish|meal/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function imageCount(spec: SiteSpecV2, sections: number): number {
  const home = spec.pages.find((p) => p.slug === "home")!;
  let n = 0;
  for (const s of home.sections.slice(0, sections)) {
    const anyS = s as unknown as {
      media?: unknown;
      items?: Array<{ media?: unknown }>;
    };
    if (anyS.media) n++;
    for (const it of anyS.items ?? []) if (it.media) n++;
  }
  return n;
}

export function creativeFindings(
  spec: SiteSpecV2,
  facts?: CreativeFacts,
): CreativeFinding[] {
  const out: CreativeFinding[] = [];
  const add = (
    rule: string,
    perspective: Perspective,
    severity: "block" | "warn",
    message: string,
  ) => out.push({ rule, perspective, severity, message });
  const home = spec.pages.find((p) => p.slug === "home")!;

  for (const f of designQuality(
    spec,
    facts?.text !== undefined ? { text: facts.text } : undefined,
  )) {
    const persp: Perspective =
      f.rule === "contrast" || f.rule === "a11y"
        ? "accessibility"
        : f.rule === "unsupported-claim" ||
            f.rule === "invented-number" ||
            f.rule === "fabrication"
          ? "evidence"
          : f.rule === "conversion" || f.rule === "cta-label"
            ? "conversion"
            : f.rule === "rhythm" || f.rule === "structure" || f.rule === "thin"
              ? "structure"
              : "copy";
    add(
      f.rule,
      persp,
      [
        "fabrication",
        "invented-number",
        "unsupported-claim",
        "contrast",
      ].includes(f.rule)
        ? "block"
        : "warn",
      f.message,
    );
  }

  for (const s of home.sections)
    if (
      s.type === "process" &&
      /how (it|we) works?|our process|simple steps?|3 easy/i.test(s.heading)
    )
      add(
        "filler-process",
        "copy",
        "warn",
        `"${s.heading}" is a generic section; use it only when the owner described real steps.`,
      );

  const hero = home.sections[0];
  const trust = home.sections.find((s) => s.type === "trust") as
    { items?: Array<{ title?: string } | string> } | undefined;
  if (hero?.type === "hero" && trust?.items) {
    const hl = new Set(hero.highlights.map(norm));
    const dup = trust.items
      .map((i) => norm(typeof i === "string" ? i : (i.title ?? "")))
      .filter((t) => t && hl.has(t));
    if (dup.length)
      add(
        "duplicate-facts",
        "copy",
        "warn",
        `The same fact appears in the hero and the trust strip: "${dup[0]}".`,
      );
  }

  const isFood = FOOD.test(
    `${facts?.industry ?? ""} ${spec.business.name} ${facts?.text ?? ""} ${spec.business.description ?? ""}`,
  );
  if (isFood) {
    const named = visibleText(spec).some((t) => FOOD_WORDS.test(t));
    if (!named)
      add(
        "category-vocabulary",
        "copy",
        "block",
        "A food business page never names a product or dish.",
      );
    const photos = imageCount(spec, 2);
    if (photos < 3)
      add(
        "photo-floor",
        "visual",
        "warn",
        `${photos} real image(s) in the first two sections; food businesses need at least 3.`,
      );
  }

  if (hero?.type === "hero" && hero.heading.split(/\s+/).length > 16)
    add("hero-length", "copy", "warn", "Hero heading is longer than 16 words.");
  return out;
}

/** K0 broken · K1 poor · K2 weak · K3 acceptable · K4 strong · K5 distinctive (needs zero findings AND distinctness). */
export type Grade = "K0" | "K1" | "K2" | "K3" | "K4" | "K5";

export function gradeFindings(
  findings: readonly CreativeFinding[],
  distinctness = 1,
): { grade: Grade; byPerspective: Record<Perspective, number> } {
  const by = Object.fromEntries(PERSPECTIVES.map((p) => [p, 0])) as Record<
    Perspective,
    number
  >;
  let blocks = 0;
  let warns = 0;
  for (const f of findings) {
    by[f.perspective]++;
    if (f.severity === "block") blocks++;
    else warns++;
  }
  let grade: Grade;
  if (blocks >= 3) grade = "K0";
  else if (blocks === 2) grade = "K1";
  else if (blocks === 1) grade = "K2";
  else if (warns >= 3) grade = "K3";
  else if (warns >= 1 || distinctness < 0.5) grade = "K4";
  else grade = "K5";
  return { grade, byPerspective: by };
}

/** 0 = identical structure, 1 = nothing in common. Compares the design signature fields. */
export function distinctness(a: SiteSpecV2, b: SiteSpecV2): number {
  const sa = designSignature(a) as Record<string, string>;
  const sb = designSignature(b) as Record<string, string>;
  const keys = Object.keys(sa);
  const same = keys.filter((k) => sa[k] === sb[k]).length;
  return 1 - same / keys.length;
}

/** The nearest existing site in the same account/category; flag when below the threshold. */
export function nearDuplicate(
  spec: SiteSpecV2,
  others: readonly SiteSpecV2[],
  threshold = 0.3,
): { nearest: number; tooSimilar: boolean } {
  if (others.length === 0) return { nearest: 1, tooSimilar: false };
  const nearest = Math.min(...others.map((o) => distinctness(spec, o)));
  return { nearest, tooSimilar: nearest < threshold };
}
