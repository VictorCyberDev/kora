import type { PairingId } from "./spec.js";

/** Self-hosted font files live in @kora/site-fonts and are served at this prefix by every host. */
export const FONT_URL_PREFIX = "/_kora/fonts/";

interface Face {
  family: string;
  slug: string;
  weights: number[];
}
export interface Pairing {
  id: PairingId;
  display: Face;
  body: Face;
  /** Optional third face used for small labels. */
  label?: Face;
  fallbackDisplay: string;
  fallbackBody: string;
  /** Weight used for headings. */
  headingWeight: number;
  tracking: string;
}

const SANS =
  'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const SERIF = 'Georgia,"Times New Roman",Times,serif';
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const f = (family: string, slug: string, weights: number[]): Face => ({
  family,
  slug,
  weights,
});

export const PAIRINGS: Record<PairingId, Pairing> = {
  "editorial-serif": {
    id: "editorial-serif",
    display: f("Playfair Display", "playfair-display", [600]),
    body: f("DM Sans", "dm-sans", [400, 700]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.015em",
  },
  "luxury-serif": {
    id: "luxury-serif",
    display: f("Cormorant Garamond", "cormorant-garamond", [400, 600]),
    body: f("Manrope", "manrope", [400, 600]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "0.005em",
  },
  "modern-grotesk": {
    id: "modern-grotesk",
    display: f("Inter", "inter", [700]),
    body: f("Inter", "inter", [400, 600]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.03em",
  },
  humanist: {
    id: "humanist",
    display: f("Lora", "lora", [600]),
    body: f("Plus Jakarta Sans", "plus-jakarta-sans", [400, 600]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.01em",
  },
  geometric: {
    id: "geometric",
    display: f("Outfit", "outfit", [600]),
    body: f("Outfit", "outfit", [400]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.02em",
  },
  "soft-rounded": {
    id: "soft-rounded",
    display: f("Nunito", "nunito", [700]),
    body: f("Nunito", "nunito", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.01em",
  },
  technical: {
    id: "technical",
    display: f("Space Grotesk", "space-grotesk", [600]),
    body: f("Inter", "inter", [400, 600]),
    label: f("JetBrains Mono", "jetbrains-mono", [400]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.025em",
  },
  "high-contrast-serif": {
    id: "high-contrast-serif",
    display: f("DM Serif Display", "dm-serif-display", [400]),
    body: f("DM Sans", "dm-sans", [400, 500, 700]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "-0.01em",
  },
  "warm-serif": {
    id: "warm-serif",
    display: f("Lora", "lora", [600]),
    body: f("Nunito", "nunito", [400, 700]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.01em",
  },
  expressive: {
    id: "expressive",
    display: f("Bricolage Grotesque", "bricolage-grotesque", [700]),
    body: f("DM Sans", "dm-sans", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.035em",
  },
  "creative-display": {
    id: "creative-display",
    display: f("Syne", "syne", [700]),
    body: f("Manrope", "manrope", [400, 600]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.02em",
  },
};

const file = (slug: string, weight: number) =>
  `${slug}-latin-${String(weight).padStart(3, "0")}-normal.woff2`;

function faces(
  p: Pairing,
): Array<{ family: string; weight: number; file: string }> {
  const out = new Map<
    string,
    { family: string; weight: number; file: string }
  >();
  for (const face of [p.display, p.body, ...(p.label ? [p.label] : [])])
    for (const w of face.weights)
      out.set(`${face.slug}:${w}`, {
        family: face.family,
        weight: w,
        file: file(face.slug, w),
      });
  return [...out.values()];
}

/** The exact font files a pairing needs. A page never loads more than these. */
export const fontFilesFor = (id: PairingId): string[] =>
  faces(PAIRINGS[id]).map((x) => x.file);

export function fontFaceCss(id: PairingId): string {
  return faces(PAIRINGS[id])
    .map(
      (x) =>
        `@font-face{font-family:"${x.family}";font-style:normal;font-weight:${x.weight};font-display:swap;src:url(${FONT_URL_PREFIX}${x.file}) format("woff2")}`,
    )
    .join("\n");
}

export function fontStacks(id: PairingId): {
  display: string;
  body: string;
  label: string;
} {
  const p = PAIRINGS[id];
  return {
    display: `"${p.display.family}",${p.fallbackDisplay}`,
    body: `"${p.body.family}",${p.fallbackBody}`,
    label: p.label
      ? `"${p.label.family}",${MONO}`
      : `"${p.body.family}",${p.fallbackBody}`,
  };
}
