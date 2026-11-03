import type { TypeVoice } from "@kora/creative";
import { FONT_URL_PREFIX } from "../v2/fonts.js";

/** One licensed OFL family at specific weights/styles. File names follow @kora/site-fonts. */
interface Face {
  family: string;
  slug: string;
  weights: Array<number | `${number}i`>;
}
export interface Voice {
  id: TypeVoice;
  family: string;
  display: Face;
  body: Face;
  /** Small caps labels and numerals. */
  label?: Face;
  fallbackDisplay: string;
  fallbackBody: string;
  headingWeight: number;
  /** True when the display face ships an italic that headlines may use. */
  italic?: boolean;
  tracking: string;
  /** Rough average glyph width as a share of the font size, used to keep headlines inside their box. */
  displayWidth: number;
  caps?: boolean;
}

const SANS =
  'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const SERIF = 'Georgia,"Times New Roman",Times,serif';
const COND = '"Arial Narrow","Helvetica Neue",Arial,sans-serif';
const f = (family: string, slug: string, weights: Face["weights"]): Face => ({
  family,
  slug,
  weights,
});

const WS = f("Work Sans", "work-sans", [400, 600]);
export const VOICES: Record<TypeVoice, Voice> = {
  "editorial-luxury": {
    id: "editorial-luxury",
    family: "editorial luxury",
    display: f("Instrument Serif", "instrument-serif", [400, "400i"]),
    body: WS,
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    italic: true,
    tracking: "-0.02em",
    displayWidth: 0.42,
  },
  "soft-luxury": {
    id: "soft-luxury",
    family: "soft luxury",
    display: f("Cormorant Garamond", "cormorant-garamond", [400, 600]),
    body: f("Manrope", "manrope", [400, 600]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "0",
    displayWidth: 0.4,
  },
  "modern-serif": {
    id: "modern-serif",
    family: "modern serif",
    display: f("Fraunces", "fraunces", [600, "400i"]),
    body: WS,
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 600,
    italic: true,
    tracking: "-0.02em",
    displayWidth: 0.5,
  },
  "heritage-serif": {
    id: "heritage-serif",
    family: "heritage serif",
    display: f("Newsreader", "newsreader", [600, "400i"]),
    body: WS,
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 600,
    italic: true,
    tracking: "-0.01em",
    displayWidth: 0.47,
  },
  "high-fashion": {
    id: "high-fashion",
    family: "high fashion",
    display: f("Bodoni Moda", "bodoni-moda", [400, 700]),
    body: f("Epilogue", "epilogue", [400, 700]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "-0.025em",
    displayWidth: 0.5,
  },
  "classical-roman": {
    id: "classical-roman",
    family: "classical roman",
    display: f("Marcellus", "marcellus", [400]),
    body: WS,
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "0.01em",
    displayWidth: 0.56,
    caps: false,
  },
  "display-statement": {
    id: "display-statement",
    family: "display statement",
    display: f("Gloock", "gloock", [400]),
    body: f("Archivo", "archivo", [400, 600]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "-0.01em",
    displayWidth: 0.55,
  },
  "condensed-utility": {
    id: "condensed-utility",
    family: "condensed utility",
    display: f("Barlow Condensed", "barlow-condensed", [700]),
    body: WS,
    label: f("Barlow Condensed", "barlow-condensed", [500]),
    fallbackDisplay: COND,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "0.005em",
    displayWidth: 0.36,
  },
  "poster-condensed": {
    id: "poster-condensed",
    family: "poster condensed",
    display: f("Oswald", "oswald", [700]),
    body: f("Archivo", "archivo", [400, 600]),
    label: f("Oswald", "oswald", [500]),
    fallbackDisplay: COND,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "0.01em",
    displayWidth: 0.4,
  },
  "technical-grotesk": {
    id: "technical-grotesk",
    family: "technical grotesk",
    display: f("Sora", "sora", [600]),
    body: f("Sora", "sora", [400, 600]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.03em",
    displayWidth: 0.58,
  },
  "wide-futurist": {
    id: "wide-futurist",
    family: "wide futurist",
    display: f("Unbounded", "unbounded", [600]),
    body: WS,
    label: f("JetBrains Mono", "jetbrains-mono", [400]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.02em",
    displayWidth: 0.72,
  },
  "friendly-humanist": {
    id: "friendly-humanist",
    family: "friendly humanist",
    display: f("Nunito", "nunito", [700]),
    body: f("Nunito", "nunito", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.01em",
    displayWidth: 0.52,
  },
  "rounded-playful": {
    id: "rounded-playful",
    family: "rounded playful",
    display: f("Fredoka", "fredoka", [600]),
    body: f("Nunito", "nunito", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 600,
    tracking: "-0.005em",
    displayWidth: 0.54,
  },
  "craft-warm": {
    id: "craft-warm",
    family: "craft warm",
    display: f("Young Serif", "young-serif", [400]),
    body: WS,
    label: f("Caveat", "caveat", [600]),
    fallbackDisplay: SERIF,
    fallbackBody: SANS,
    headingWeight: 400,
    tracking: "-0.01em",
    displayWidth: 0.52,
  },
  "local-commerce": {
    id: "local-commerce",
    family: "local commerce",
    display: f("Archivo", "archivo", [800]),
    body: f("Archivo", "archivo", [400, 600]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 800,
    tracking: "-0.025em",
    displayWidth: 0.56,
  },
  "minimal-modernist": {
    id: "minimal-modernist",
    family: "minimal modernist",
    display: f("Epilogue", "epilogue", [700]),
    body: f("Epilogue", "epilogue", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.03em",
    displayWidth: 0.57,
  },
  "quirky-grotesk": {
    id: "quirky-grotesk",
    family: "quirky grotesk",
    display: f("Bricolage Grotesque", "bricolage-grotesque", [700]),
    body: f("DM Sans", "dm-sans", [400, 700]),
    fallbackDisplay: SANS,
    fallbackBody: SANS,
    headingWeight: 700,
    tracking: "-0.025em",
    displayWidth: 0.52,
  },
};

const file = (slug: string, w: number | string) => {
  const italic = typeof w === "string";
  const n = italic ? Number.parseInt(w, 10) : w;
  return {
    weight: n,
    italic,
    file: `${slug}-latin-${String(n).padStart(3, "0")}-${italic ? "italic" : "normal"}.woff2`,
  };
};
interface Resolved {
  family: string;
  weight: number;
  italic: boolean;
  file: string;
}
function facesOf(v: Voice): Resolved[] {
  const out = new Map<string, Resolved>();
  for (const face of [v.display, v.body, v.label].filter(Boolean) as Face[])
    for (const w of face.weights) {
      const x = file(face.slug, w);
      out.set(x.file, { family: face.family, ...x });
    }
  return [...out.values()];
}
export const voiceFiles = (id: TypeVoice): string[] =>
  facesOf(VOICES[id]).map((x) => x.file);
export const voiceFaceCss = (id: TypeVoice): string =>
  facesOf(VOICES[id])
    .map(
      (x) =>
        `@font-face{font-family:"${x.family}";font-style:${x.italic ? "italic" : "normal"};font-weight:${x.weight};font-display:swap;src:url(${FONT_URL_PREFIX}${x.file}) format("woff2")}`,
    )
    .join("\n");
export function voiceStacks(id: TypeVoice) {
  const v = VOICES[id];
  return {
    display: `"${v.display.family}",${v.fallbackDisplay}`,
    body: `"${v.body.family}",${v.fallbackBody}`,
    label: v.label
      ? `"${v.label.family}",${v.fallbackBody}`
      : `"${v.body.family}",${v.fallbackBody}`,
  };
}
