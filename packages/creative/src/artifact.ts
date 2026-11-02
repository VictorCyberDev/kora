/**
 * ArtifactSpec: one validated contract for every non-website creative (feed posts, stories, status, banners, flyers,
 * carousel slides). One trusted renderer turns it into SVG; the API rasterises that to PNG. Format drives composition:
 * a 1080x1080 square and a 1080x1920 story are laid out differently, with their own safe zones.
 *
 * The spec carries the Brand OS version and hash it was made from, so an approved flyer keeps pointing at the brand
 * of the day it was made and is never silently restyled when the brand changes.
 */
import { z } from "zod";
import { contrast, ensureContrast, mix, readableOn } from "./color.js";
import type { DesignGenome, TypeVoice } from "./genome.js";
import { findCliches } from "./copy.js";

export interface ArtifactFormat {
  label: string;
  width: number;
  height: number;
  /** Areas platform chrome (profile bar, reply box, buttons) covers; nothing important goes here. */
  safe: { t: number; r: number; b: number; l: number };
  kind: "feed" | "story" | "banner" | "print" | "slide";
}
export const ARTIFACT_FORMATS = {
  "social-square": {
    label: "Square post",
    width: 1080,
    height: 1080,
    safe: { t: 72, r: 72, b: 72, l: 72 },
    kind: "feed",
  },
  "social-portrait": {
    label: "Portrait post",
    width: 1080,
    height: 1350,
    safe: { t: 80, r: 72, b: 80, l: 72 },
    kind: "feed",
  },
  story: {
    label: "Story",
    width: 1080,
    height: 1920,
    safe: { t: 250, r: 72, b: 340, l: 72 },
    kind: "story",
  },
  "whatsapp-status": {
    label: "WhatsApp status",
    width: 1080,
    height: 1920,
    safe: { t: 190, r: 72, b: 230, l: 72 },
    kind: "story",
  },
  banner: {
    label: "Banner",
    width: 1500,
    height: 500,
    safe: { t: 56, r: 90, b: 56, l: 90 },
    kind: "banner",
  },
  "flyer-a5": {
    label: "Flyer (A5)",
    width: 1480,
    height: 2100,
    safe: { t: 110, r: 110, b: 110, l: 110 },
    kind: "print",
  },
  "carousel-cover": {
    label: "Carousel cover",
    width: 1080,
    height: 1350,
    safe: { t: 80, r: 72, b: 110, l: 72 },
    kind: "slide",
  },
  "carousel-slide": {
    label: "Carousel slide",
    width: 1080,
    height: 1350,
    safe: { t: 80, r: 72, b: 110, l: 72 },
    kind: "slide",
  },
} as const satisfies Record<string, ArtifactFormat>;
export type ArtifactFormatId = keyof typeof ARTIFACT_FORMATS;
export const ARTIFACT_FORMAT_IDS = Object.keys(ARTIFACT_FORMATS) as [
  ArtifactFormatId,
  ...ArtifactFormatId[],
];
/** Print: 10 px per mm (254 dpi), 3 mm bleed added outside the trim. RGB only; this is not press-ready CMYK/PDF-X. */
export const PRINT = {
  pxPerMm: 10,
  bleedMm: 3,
  colour: "RGB",
  pressReady: false,
} as const;

export const COMPOSITIONS = [
  "poster-type",
  "photo-hero",
  "split-panel",
  "editorial-column",
  "badge-offer",
  "ticker-banner",
  "list-card",
] as const;
export type Composition = (typeof COMPOSITIONS)[number];
export const OBJECTIVES = [
  "launch",
  "offer",
  "awareness",
  "booking",
  "lead",
  "product",
  "event",
  "education",
  "retention",
  "visit",
  "order",
  "announcement",
] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const t = (n: number) => z.string().trim().max(n);

export const ArtifactSpecSchema = z.object({
  schema: z.literal("kora.artifact/1").default("kora.artifact/1"),
  format: z.enum(ARTIFACT_FORMAT_IDS),
  brand: z.object({
    osVersion: z.number().int().min(1),
    osHash: z.string().regex(/^[a-f0-9]{64}$/),
    name: t(100).min(1),
    mode: z.enum(["light", "dark"]),
    palette: z.object({
      background: hex,
      foreground: hex,
      primary: hex,
      secondary: hex,
      accent: hex,
    }),
    typeVoice: z.string().max(40),
    signatureMotif: z.string().max(40),
    paletteBehavior: z.string().max(40),
    compositionMode: z.string().max(40),
    radius: z.string().max(20),
    logoAssetId: z.string().max(80).nullable().default(null),
  }),
  campaign: z
    .object({
      id: z.string().max(60).optional(),
      objective: z.enum(OBJECTIVES).default("announcement"),
    })
    .default({ objective: "announcement" }),
  composition: z.enum(COMPOSITIONS),
  content: z.object({
    eyebrow: t(40).default(""),
    headline: t(80).min(1),
    subline: t(160).default(""),
    detail: t(90).default(""),
    bullets: z.array(t(50).min(1)).max(6).default([]),
    cta: t(30).default(""),
    contact: t(60).default(""),
    /** The offer wording exactly as the owner supplied it (never computed or improved). */
    offer: t(40).default(""),
  }),
  media: z
    .object({
      kind: z.enum([
        "owner-supplied",
        "licensed-stock",
        "ai-generated",
        "plate",
        "none",
      ]),
      /** Which stored asset the API should embed; the renderer never fetches anything itself. */
      assetId: z.string().max(80).optional(),
      alt: t(200).default(""),
      reviewStatus: z
        .enum(["owner-approved", "unreviewed", "kora-curated", "n/a"])
        .default("n/a"),
    })
    .default({ kind: "none", alt: "", reviewStatus: "n/a" }),
  print: z.boolean().default(false),
  provenance: z.object({
    composer: z.literal("kora-creative/1"),
    seed: z.number().int().min(0),
  }),
});
export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

// ---------------------------------------------------------------- composition choice
export interface BrandForArtifact {
  name: string;
  version: number;
  hash: string;
  mode: "light" | "dark";
  palette: ArtifactSpec["brand"]["palette"];
  genome: DesignGenome;
  logoAssetId?: string | null;
}
export interface ComposeInput {
  format: ArtifactFormatId;
  brand: BrandForArtifact;
  objective?: (typeof OBJECTIVES)[number];
  content: Partial<ArtifactSpec["content"]> & { headline: string };
  hasImage?: boolean;
  imageKind?: "owner-supplied" | "licensed-stock" | "ai-generated";
  imageReview?: "owner-approved" | "unreviewed" | "kora-curated";
  assetId?: string;
  campaignId?: string;
  seed?: number;
  print?: boolean;
}

/** Composition follows format first, then the brand's own composition mode. Not a template lookup by vertical. */
export function chooseComposition(i: {
  format: ArtifactFormatId;
  genome: DesignGenome;
  hasImage: boolean;
  bullets: number;
  offer: boolean;
}): Composition {
  const f = ARTIFACT_FORMATS[i.format];
  const m = i.genome.compositionMode;
  if (f.kind === "banner")
    return m === "poster-bold" || i.genome.signatureMotif === "marquee-band"
      ? "ticker-banner"
      : i.hasImage
        ? "split-panel"
        : "editorial-column";
  if (f.kind === "print")
    return i.bullets >= 3
      ? "list-card"
      : i.hasImage
        ? "split-panel"
        : m === "poster-bold"
          ? "poster-type"
          : "editorial-column";
  if (f.kind === "story")
    return i.hasImage && i.genome.imageDominance !== "none"
      ? "photo-hero"
      : i.offer
        ? "badge-offer"
        : m === "poster-bold" || m === "collage-layered"
          ? "poster-type"
          : "editorial-column";
  // feed + slides
  if (i.bullets >= 3 && f.kind === "slide") return "list-card";
  if (
    i.hasImage &&
    (m === "cinematic-minimal" ||
      m === "monograph" ||
      i.genome.imageDominance === "dominant")
  )
    return "photo-hero";
  if (i.offer && (m === "collage-layered" || m === "catalog-grid"))
    return "badge-offer";
  if (m === "poster-bold" || m === "stacked-utility") return "poster-type";
  if (m === "split-narrative" || m === "catalog-grid")
    return i.hasImage ? "split-panel" : "poster-type";
  return "editorial-column";
}

export function composeArtifact(i: ComposeInput): ArtifactSpec {
  const g = i.brand.genome;
  const bullets = (i.content.bullets ?? []).slice(0, 6);
  const composition = chooseComposition({
    format: i.format,
    genome: g,
    hasImage: !!i.hasImage,
    bullets: bullets.length,
    offer: !!i.content.offer,
  });
  return ArtifactSpecSchema.parse({
    schema: "kora.artifact/1",
    format: i.format,
    brand: {
      osVersion: i.brand.version,
      osHash: i.brand.hash,
      name: i.brand.name,
      mode: i.brand.mode,
      palette: i.brand.palette,
      typeVoice: g.typeVoice,
      signatureMotif: g.signatureMotif,
      paletteBehavior: g.paletteBehavior,
      compositionMode: g.compositionMode,
      radius: g.radiusStyle,
      logoAssetId: i.brand.logoAssetId ?? null,
    },
    campaign: {
      ...(i.campaignId ? { id: i.campaignId } : {}),
      objective: i.objective ?? "announcement",
    },
    composition,
    content: { ...i.content, bullets },
    media: i.hasImage
      ? {
          kind: i.imageKind ?? "owner-supplied",
          ...(i.assetId ? { assetId: i.assetId } : {}),
          alt: "",
          reviewStatus:
            i.imageReview ??
            (i.imageKind === "licensed-stock" ? "kora-curated" : "unreviewed"),
        }
      : {
          kind: g.imageDominance === "none" ? "none" : "plate",
          alt: "",
          reviewStatus: "n/a",
        },
    print: !!i.print || ARTIFACT_FORMATS[i.format].kind === "print",
    provenance: { composer: "kora-creative/1", seed: i.seed ?? 1 },
  });
}

// ---------------------------------------------------------------- validation
export interface ArtifactIssue {
  code: string;
  severity: "block" | "warn";
  message: string;
}
export function artifactIssues(
  spec: ArtifactSpec,
  o: { suppliedText?: string } = {},
): ArtifactIssue[] {
  const out: ArtifactIssue[] = [];
  const all = [
    spec.content.headline,
    spec.content.subline,
    spec.content.detail,
    spec.content.cta,
    spec.content.offer,
    ...spec.content.bullets,
  ].join(" ");
  for (const c of findCliches(all))
    out.push({
      code: "COPY_CLICHE",
      severity: "warn",
      message: `Generic phrase: "${c}".`,
    });
  if (
    spec.media.kind === "ai-generated" &&
    spec.media.reviewStatus !== "owner-approved"
  )
    out.push({
      code: "MEDIA_UNREVIEWED",
      severity: "block",
      message:
        "A generated picture must be approved by the owner before it is used.",
    });
  if (spec.media.kind === "owner-supplied" && !spec.media.assetId)
    out.push({
      code: "MEDIA_MISSING",
      severity: "block",
      message: "The picture this artifact refers to was not provided.",
    });
  const p = spec.brand.palette;
  if (contrast(p.foreground, p.background) < 4.5)
    out.push({
      code: "LOW_CONTRAST",
      severity: "block",
      message: "Brand text and background do not have enough contrast.",
    });
  if (o.suppliedText) {
    const supplied = o.suppliedText.toLowerCase();
    const nums =
      [
        spec.content.headline,
        spec.content.subline,
        spec.content.detail,
        spec.content.offer,
      ]
        .join(" ")
        .match(/\d[\d,.]*/g) ?? [];
    for (const n of nums)
      if (
        n.replace(/\D/g, "").length >= 2 &&
        !supplied.includes(n.toLowerCase())
      )
        out.push({
          code: "INVENTED_NUMBER",
          severity: "block",
          message: `"${n}" was not supplied by the owner.`,
        });
  }
  return out;
}

// ---------------------------------------------------------------- renderer
const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export interface VoiceFamilies {
  display: string;
  body: string;
  weight: number;
  italic: boolean;
  w: number;
  upper?: boolean;
}
/** Mirrors @kora/site-schema's voices; a test asserts the two stay in step. Widths are average glyph width / size. */
export const VOICE_FAMILIES: Record<TypeVoice, VoiceFamilies> = {
  "editorial-luxury": {
    display: "Instrument Serif",
    body: "Work Sans",
    weight: 400,
    italic: true,
    w: 0.42,
  },
  "soft-luxury": {
    display: "Cormorant Garamond",
    body: "Manrope",
    weight: 400,
    italic: false,
    w: 0.4,
  },
  "modern-serif": {
    display: "Fraunces",
    body: "Work Sans",
    weight: 600,
    italic: true,
    w: 0.5,
  },
  "heritage-serif": {
    display: "Newsreader",
    body: "Work Sans",
    weight: 600,
    italic: true,
    w: 0.47,
  },
  "high-fashion": {
    display: "Bodoni Moda",
    body: "Epilogue",
    weight: 400,
    italic: false,
    w: 0.5,
  },
  "classical-roman": {
    display: "Marcellus",
    body: "Work Sans",
    weight: 400,
    italic: false,
    w: 0.56,
  },
  "display-statement": {
    display: "Gloock",
    body: "Archivo",
    weight: 400,
    italic: false,
    w: 0.55,
  },
  "condensed-utility": {
    display: "Barlow Condensed",
    body: "Work Sans",
    weight: 700,
    italic: false,
    w: 0.36,
  },
  "poster-condensed": {
    display: "Oswald",
    body: "Archivo",
    weight: 700,
    italic: false,
    w: 0.4,
  },
  "technical-grotesk": {
    display: "Sora",
    body: "Sora",
    weight: 600,
    italic: false,
    w: 0.58,
  },
  "wide-futurist": {
    display: "Unbounded",
    body: "Work Sans",
    weight: 600,
    italic: false,
    w: 0.72,
  },
  "friendly-humanist": {
    display: "Nunito",
    body: "Nunito",
    weight: 700,
    italic: false,
    w: 0.52,
  },
  "rounded-playful": {
    display: "Fredoka",
    body: "Nunito",
    weight: 600,
    italic: false,
    w: 0.54,
  },
  "craft-warm": {
    display: "Young Serif",
    body: "Work Sans",
    weight: 400,
    italic: false,
    w: 0.52,
  },
  "local-commerce": {
    display: "Archivo",
    body: "Archivo",
    weight: 800,
    italic: false,
    w: 0.56,
  },
  "minimal-modernist": {
    display: "Epilogue",
    body: "Epilogue",
    weight: 700,
    italic: false,
    w: 0.57,
  },
  "quirky-grotesk": {
    display: "Bricolage Grotesque",
    body: "DM Sans",
    weight: 700,
    italic: false,
    w: 0.52,
  },
};

function wrapLines(
  text: string,
  size: number,
  maxW: number,
  w: number,
): string[] {
  const per = Math.max(1, Math.floor(maxW / (size * w)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= per) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
/** Largest size (stepping down) at which `text` fits the box without breaking a word or exceeding `maxLines`. */
function fitText(
  text: string,
  maxW: number,
  maxH: number,
  start: number,
  min: number,
  w: number,
  maxLines: number,
  lh = 1.04,
) {
  // A single long word cannot wrap: shrink until the longest word fits the box, however small that is.
  const longestWord = Math.max(1, ...text.split(/\s+/).map((x) => x.length));
  min = Math.min(
    min,
    Math.max(16, Math.floor(maxW / (longestWord * w * 1.04))),
  );
  for (let s = start; s >= min; s -= 2) {
    const lines = wrapLines(text, s, maxW, w);
    const longest = Math.max(...lines.map((l) => l.length));
    if (
      lines.length <= maxLines &&
      lines.length * s * lh <= maxH &&
      longest * s * w <= maxW * 1.04
    )
      return { size: s, lines };
  }
  const lines = wrapLines(text, min, maxW, w).slice(0, maxLines);
  return { size: min, lines };
}

export interface RenderOpts {
  /** Resolved image the API embeds (data URI). The spec only references an asset id. */
  imageDataUri?: string;
  /** Natural width/height of that image so it can be covered without distortion. */
  imageSize?: { width: number; height: number };
}
export interface RenderedArtifact {
  svg: string;
  width: number;
  height: number;
  /** Where text actually landed; used by quality gates (overflow, safe zones). */
  boxes: Array<{ role: string; x: number; y: number; w: number; h: number }>;
}

export function renderArtifactSvg(
  spec: ArtifactSpec,
  o: RenderOpts = {},
): RenderedArtifact {
  const fmt = ARTIFACT_FORMATS[spec.format];
  const bleed = spec.print ? PRINT.bleedMm * PRINT.pxPerMm : 0;
  const W = fmt.width,
    H = fmt.height;
  const P = spec.brand.palette;
  const v =
    VOICE_FAMILIES[spec.brand.typeVoice as TypeVoice] ??
    VOICE_FAMILIES["minimal-modernist"];
  const dark = spec.brand.mode === "dark";
  const boxes: RenderedArtifact["boxes"] = [];
  const comp = spec.composition;

  // ---- colour field: what the composition paints, and the legible ink on it
  const field = (() => {
    if (
      comp === "poster-type" ||
      comp === "badge-offer" ||
      comp === "ticker-banner"
    )
      return spec.brand.paletteBehavior === "color-field"
        ? P.primary
        : dark
          ? P.background
          : P.background;
    if (comp === "photo-hero") return mix(P.background, "#000000", 0.5);
    if (comp === "split-panel") return P.background;
    return P.background;
  })();
  const ink = ensureContrast(
    readableOn(field, P.foreground, dark ? P.foreground : P.background),
    field,
    7,
  );
  const muted = ensureContrast(mix(ink, field, 0.32), field, 4.5);
  const accentOn = (bg: string) => ensureContrast(P.accent, bg, 4.5);
  const btnBg =
    [P.primary, P.accent, P.secondary, ink].find(
      (c) => contrast(c, field) >= 3,
    ) ?? ink;
  const btnFg = readableOn(btnBg);

  const m = {
    l: fmt.safe.l,
    r: W - fmt.safe.r,
    t: fmt.safe.t,
    b: H - fmt.safe.b,
  };
  const innerW = m.r - m.l;
  const els: string[] = [];
  const defs: string[] = [];
  const text = (
    role: string,
    lines: string[],
    x: number,
    y: number,
    size: number,
    o2: {
      family: string;
      weight?: number;
      fill: string;
      anchor?: "start" | "middle" | "end";
      lh?: number;
      ls?: number;
      italic?: boolean;
      upper?: boolean;
      w?: number;
    },
  ) => {
    const lh = o2.lh ?? 1.06;
    const ls = (o2.ls ?? 0) * size;
    const tspans = lines
      .map(
        (l, i) =>
          `<tspan x="${x}" dy="${i === 0 ? 0 : (size * lh).toFixed(1)}">${xml(o2.upper ? l.toUpperCase() : l)}</tspan>`,
      )
      .join("");
    els.push(
      `<text x="${x}" y="${y}" font-family="${xml(o2.family)}" font-size="${size}" font-weight="${o2.weight ?? 400}"${o2.italic ? ' font-style="italic"' : ""} fill="${o2.fill}" text-anchor="${o2.anchor ?? "start"}"${ls ? ` letter-spacing="${ls.toFixed(2)}"` : ""}>${tspans}</text>`,
    );
    const widest =
      Math.max(...lines.map((l) => l.length)) * size * (o2.w ?? 0.55);
    boxes.push({
      role,
      x:
        o2.anchor === "middle"
          ? x - widest / 2
          : o2.anchor === "end"
            ? x - widest
            : x,
      y: y - size,
      w: widest,
      h: lines.length * size * lh,
    });
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    extra = "",
  ) =>
    els.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`,
    );

  const isUpper =
    spec.brand.compositionMode === "poster-bold" ||
    spec.brand.typeVoice === "poster-condensed" ||
    spec.brand.typeVoice === "condensed-utility";
  const headW = v.w * (isUpper ? 1.3 : 1);
  const headline = spec.content.headline;
  const hasMedia = !!o.imageDataUri;
  const photoLike = comp === "photo-hero" || comp === "split-panel";

  // ---- image helper: cover without distortion, optionally clipped
  const image = (x: number, y: number, w: number, h: number, clip?: string) => {
    if (!o.imageDataUri) return false;
    const iw = o.imageSize?.width ?? 1600,
      ih = o.imageSize?.height ?? 1067;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s,
      dh = ih * s;
    const id = `c${els.length}`;
    defs.push(
      clip
        ? `<clipPath id="${id}">${clip}</clipPath>`
        : `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`,
    );
    els.push(
      `<g clip-path="url(#${id})"><image href="${o.imageDataUri}" x="${(x + (w - dw) / 2).toFixed(1)}" y="${(y + (h - dh) / 2).toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" preserveAspectRatio="xMidYMid slice"/></g>`,
    );
    return true;
  };
  /** Procedural graphic standing in for a picture: flat, on-brand, and obviously a graphic. */
  const plate = (x: number, y: number, w: number, h: number, clip?: string) => {
    const id = `p${els.length}`;
    defs.push(
      clip
        ? `<clipPath id="${id}">${clip}</clipPath>`
        : `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`,
    );
    const r = Math.min(w, h);
    const loud =
      spec.brand.paletteBehavior === "color-field" ||
      spec.brand.compositionMode === "poster-bold" ||
      spec.brand.compositionMode === "collage-layered";
    const a = loud ? P.primary : P.secondary,
      b = loud ? P.secondary : mix(P.background, P.foreground, 0.12),
      c = loud ? P.accent : P.primary;
    els.push(
      `<g clip-path="url(#${id})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${b}"/><circle cx="${x + w * 0.62}" cy="${y + h * 0.38}" r="${r * 0.34}" fill="${a}"/><circle cx="${x + w * 0.3}" cy="${y + h * 0.72}" r="${r * 0.2}" fill="${c}" opacity="${loud ? 1 : 0.5}"/><path d="M${x} ${y + h * 0.86}Q${x + w * 0.5} ${y + h * 0.66} ${x + w} ${y + h * 0.86}V${y + h}H${x}Z" fill="${a}" opacity="0.55"/></g>`,
    );
  };
  const visual = (x: number, y: number, w: number, h: number, arch = false) => {
    const clip = arch
      ? `<path d="M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}Z"/>`
      : undefined;
    if (!image(x, y, w, h, clip)) plate(x, y, w, h, clip);
  };

  // ---- recurring brand device (the motif), drawn small so it signs the work without shouting
  const motif = (cx: number, cy: number, size: number, onBg: string) => {
    const mot = spec.brand.signatureMotif,
      c = accentOn(onBg);
    if (mot === "stamp-label" || mot === "monogram-seal") {
      els.push(
        `<g transform="rotate(-9 ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${size / 2}" fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="${mot === "stamp-label" ? "8 6" : "0"}"/><text x="${cx}" y="${cy + size * 0.16}" text-anchor="middle" font-family="${xml(v.display)}" font-size="${size * 0.46}" font-weight="${v.weight}" fill="${c}">${xml((spec.brand.name.trim()[0] ?? "K").toUpperCase())}</text></g>`,
      );
    } else if (mot === "corner-brackets") {
      const s = size * 0.5;
      els.push(
        `<path d="M${cx - s} ${cy - s + 28}V${cy - s}H${cx - s + 28}M${cx + s - 28} ${cy + s}H${cx + s}V${cy + s - 28}" fill="none" stroke="${c}" stroke-width="3"/>`,
      );
    } else if (mot === "hairline-rules" || mot === "numerals") {
      els.push(
        `<rect x="${cx - size / 2}" y="${cy}" width="${size}" height="2" fill="${c}"/>`,
      );
    } else if (mot === "arch-frame") {
      els.push(
        `<path d="M${cx - size / 3} ${cy + size / 2}V${cy}a${size / 3} ${size / 3} 0 0 1 ${(size * 2) / 3} 0V${cy + size / 2}" fill="none" stroke="${c}" stroke-width="3"/>`,
      );
    } else if (
      mot === "grain-dots" ||
      mot === "wave-edge" ||
      mot === "ticket-perforation" ||
      mot === "diagonal-cut"
    ) {
      els.push(
        `<path d="M${cx - size / 2} ${cy}${Array.from({ length: 5 }, () => `q${size / 10} ${-size / 8} ${size / 5} 0`).join("")}" fill="none" stroke="${c}" stroke-width="3"/>`,
      );
    }
  };

  const wordmark = (
    x: number,
    y: number,
    size: number,
    fill: string,
    anchor: "start" | "middle" | "end" = "start",
  ) =>
    text("brand", [spec.brand.name], x, y, size, {
      family: v.display,
      weight: v.weight,
      fill,
      anchor,
      w: v.w,
      upper: isUpper,
    });
  const cta = (
    x: number,
    y: number,
    label: string,
    size = 34,
    anchor: "start" | "middle" = "start",
  ) => {
    if (!label) return 0;
    const w = Math.min(innerW, label.length * size * 0.6 + size * 2.2),
      h = size * 2.1;
    const rx =
      spec.brand.radius === "pill"
        ? h / 2
        : spec.brand.radius === "round"
          ? 18
          : spec.brand.radius === "none"
            ? 0
            : 6;
    const bx = anchor === "middle" ? x - w / 2 : x;
    const outline =
      spec.brand.compositionMode === "monograph" ||
      spec.brand.compositionMode === "centered-classical";
    els.push(
      `<rect x="${bx}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${outline ? "none" : btnBg}"${outline ? ` stroke="${ink}" stroke-width="2"` : ""}/>`,
    );
    text("cta", [label], bx + w / 2, y + h * 0.66, size, {
      family: v.body,
      weight: 600,
      fill: outline ? ink : btnFg,
      anchor: "middle",
      w: 0.58,
      upper: isUpper,
      ls: isUpper ? 0.04 : 0,
    });
    boxes.push({ role: "cta-box", x: bx, y, w, h });
    return h;
  };
  const contactLine = (
    x: number,
    y: number,
    size: number,
    fill: string,
    anchor: "start" | "middle" | "end" = "start",
  ) => {
    if (spec.content.contact)
      text("contact", [spec.content.contact], x, y, size, {
        family: v.body,
        weight: 600,
        fill,
        anchor,
        w: 0.56,
      });
  };

  // ---- compositions
  const story = fmt.kind === "story";
  const baseSize = Math.round(
    Math.min(W, H) * (fmt.kind === "banner" ? 0.2 : story ? 0.085 : 0.105),
  );
  const eyebrow = (
    x: number,
    y: number,
    fill: string,
    anchor: "start" | "middle" = "start",
  ) => {
    if (spec.content.eyebrow)
      text(
        "eyebrow",
        [spec.content.eyebrow],
        x,
        y,
        Math.round(baseSize * 0.27),
        {
          family: v.body,
          weight: 600,
          fill,
          anchor,
          ls: 0.16,
          upper: true,
          w: 0.62,
        },
      );
  };

  if (comp === "poster-type") {
    rect(0, 0, W, H, field);
    if (spec.brand.paletteBehavior !== "color-field") rect(0, 0, W, H, field);
    const top = m.t + (story ? 40 : 70);
    const subH = spec.content.subline ? 130 : 0;
    const hf = fitText(
      headline,
      innerW,
      Math.max(200, m.b - 300 - top - subH),
      baseSize * 1.7,
      baseSize * 0.6,
      headW,
      story ? 6 : 5,
      0.98,
    );
    eyebrow(m.l, top - 30, accentOn(field));
    text("headline", hf.lines, m.l, top + hf.size, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      lh: 0.98,
      upper: isUpper,
      w: headW,
      ls: isUpper ? 0.01 : -0.02,
    });
    let y = top + hf.size * (hf.lines.length * 0.98 + 0.5);
    if (spec.content.subline) {
      const sf = fitText(
        spec.content.subline,
        innerW * 0.86,
        220,
        Math.round(baseSize * 0.34),
        28,
        0.52,
        3,
        1.3,
      );
      text("subline", sf.lines, m.l, y, sf.size, {
        family: v.body,
        fill: muted,
        lh: 1.3,
        w: 0.52,
      });
      y += sf.lines.length * sf.size * 1.3 + 30;
    }
    const ctaY = Math.max(y + 20, m.b - 250);
    const ch = cta(m.l, ctaY, spec.content.cta);
    contactLine(m.l, ctaY + ch + 54, 30, ink);
    // brand device at the bottom edge, inside the safe zone
    if (
      spec.brand.signatureMotif === "marquee-band" ||
      spec.brand.signatureMotif === "diagonal-cut"
    ) {
      rect(0, H - fmt.safe.b + 30, W, 70, btnBg);
      text(
        "ticker",
        [Array(6).fill(spec.brand.name).join("  •  ")],
        24,
        H - fmt.safe.b + 78,
        40,
        {
          family: v.display,
          weight: v.weight,
          fill: btnFg,
          upper: true,
          w: v.w,
        },
      );
    } else motif(m.r - 70, m.b - 40, 110, field);
    wordmark(
      m.l,
      m.b - 6 + (story ? -10 : 0),
      Math.round(baseSize * 0.34),
      ink,
    );
  } else if (comp === "photo-hero") {
    rect(0, 0, W, H, field);
    if (hasMedia) image(0, 0, W, H);
    else plate(0, 0, W, H);
    // functional scrim so type is legible on any photograph
    defs.push(
      `<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient>`,
    );
    rect(0, 0, W, H, "url(#scrim)");
    const white = "#ffffff";
    const hf = fitText(
      headline,
      innerW,
      H * 0.3,
      baseSize * 1.35,
      baseSize * 0.62,
      headW,
      4,
      1,
    );
    const bottom = m.b - 10;
    let y = bottom - 20;
    if (spec.content.cta) {
      const ch = cta(m.l, y - 70, spec.content.cta);
      void ch;
      y -= 140;
    }
    if (spec.content.subline) {
      const sf = fitText(
        spec.content.subline,
        innerW * 0.9,
        160,
        Math.round(baseSize * 0.3),
        26,
        0.52,
        2,
        1.3,
      );
      y -= sf.lines.length * sf.size * 1.3;
      text("subline", sf.lines, m.l, y + sf.size, sf.size, {
        family: v.body,
        fill: "#f1f1f1",
        lh: 1.3,
        w: 0.52,
      });
      y -= 24;
    }
    y -= hf.lines.length * hf.size * 1.0;
    text("headline", hf.lines, m.l, y + hf.size, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: white,
      lh: 1.0,
      upper: isUpper,
      w: headW,
    });
    eyebrow(m.l, y - 24, "#ffffff");
    wordmark(m.l, m.t + 36, Math.round(baseSize * 0.34), white);
    if (spec.brand.signatureMotif === "corner-brackets")
      els.push(
        `<path d="M${m.l - 22} ${m.t - 22}H${m.l + 36}M${m.l - 22} ${m.t - 22}V${m.t + 36}M${m.r + 22} ${m.b + 22}H${m.r - 36}M${m.r + 22} ${m.b + 22}V${m.b - 36}" fill="none" stroke="#fff" stroke-width="3"/>`,
      );
  } else if (comp === "split-panel") {
    rect(0, 0, W, H, field);
    const wide = W > H * 1.2;
    const vis = wide
      ? { x: W * 0.58, y: 0, w: W * 0.42, h: H }
      : { x: 0, y: 0, w: W, h: H * (story ? 0.5 : 0.5) };
    visual(
      vis.x,
      vis.y,
      vis.w,
      vis.h,
      spec.brand.signatureMotif === "arch-frame" && !wide,
    );
    const tx = wide ? m.l : m.l,
      tw = wide ? W * 0.58 - m.l - 40 : innerW;
    const ty = wide ? m.t + 20 : vis.h + 70;
    const hf = fitText(
      headline,
      tw,
      wide ? H * 0.5 : H * 0.22,
      baseSize * (wide ? 0.95 : 1.1),
      baseSize * 0.55,
      headW,
      wide ? 3 : 3,
      1.02,
    );
    eyebrow(tx, ty - 6, accentOn(field));
    text("headline", hf.lines, tx, ty + 30 + hf.size * 0.85, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      lh: 1.02,
      upper: isUpper,
      w: headW,
    });
    let y = ty + 30 + hf.size * (0.85 + hf.lines.length * 1.02) + 10;
    if (spec.content.subline && !wide) {
      const sf = fitText(
        spec.content.subline,
        tw,
        130,
        Math.round(baseSize * 0.3),
        26,
        0.52,
        2,
        1.3,
      );
      text("subline", sf.lines, tx, y + sf.size, sf.size, {
        family: v.body,
        fill: muted,
        lh: 1.3,
        w: 0.52,
      });
      y += sf.lines.length * sf.size * 1.3 + 20;
    }
    const cy = wide ? H - m.t - 80 : Math.min(y + 14, m.b - 80);
    cta(tx, cy, spec.content.cta, wide ? 28 : 32);
    if (!wide) wordmark(m.r, m.b + 20, 30, muted, "end");
    else wordmark(tx, H - 22, 28, muted);
  } else if (comp === "editorial-column") {
    rect(0, 0, W, H, field);
    const colX = m.l + (fmt.kind === "banner" ? 0 : 36);
    const colW = fmt.kind === "banner" ? W * 0.6 : innerW - 36;
    // left rule: the quiet device
    if (fmt.kind !== "banner") rect(m.l, m.t, 3, m.b - m.t, accentOn(field));
    const centered =
      spec.brand.compositionMode === "centered-classical" ||
      spec.brand.compositionMode === "cinematic-minimal";
    const anchor =
      centered && fmt.kind !== "banner"
        ? ("middle" as const)
        : ("start" as const);
    const x = anchor === "middle" ? W / 2 : colX;
    const isBanner = fmt.kind === "banner";
    const hf = fitText(
      headline,
      anchor === "middle" ? innerW * 0.86 : colW,
      H * (isBanner ? 0.5 : 0.4),
      baseSize * 1.35,
      baseSize * 0.55,
      headW,
      isBanner ? 3 : 5,
      1.04,
    );
    const sf =
      spec.content.subline && !isBanner
        ? fitText(
            spec.content.subline,
            anchor === "middle" ? innerW * 0.7 : colW * 0.9,
            190,
            Math.round(baseSize * 0.3),
            26,
            0.52,
            3,
            1.35,
          )
        : null;
    const ctaY = isBanner ? H - 135 : m.b - 215;
    const blockH =
      hf.lines.length * hf.size * 1.04 +
      28 +
      (sf ? sf.lines.length * sf.size * 1.35 + 24 : 0);
    const centred = m.t + Math.max(10, (ctaY - m.t - blockH) * 0.42);
    // The block is centred in the space above the action row, but never lower than the row allows.
    const y0 = isBanner
      ? m.t + 40
      : Math.max(m.t + 34, Math.min(centred, ctaY - 26 - blockH));
    eyebrow(
      x,
      y0 - 24,
      accentOn(field),
      anchor === "middle" ? "middle" : "start",
    );
    text("headline", hf.lines, x, y0 + hf.size * 0.85, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      anchor,
      lh: 1.04,
      upper: isUpper,
      w: headW,
      ls: -0.01,
    });
    let y = y0 + hf.size * (0.85 + hf.lines.length * 1.04) + 28;
    if (sf) {
      text("subline", sf.lines, x, y + sf.size, sf.size, {
        family: v.body,
        fill: muted,
        anchor,
        lh: 1.35,
        w: 0.52,
      });
      y += sf.lines.length * sf.size * 1.35 + 24;
    }
    cta(
      x,
      Math.min(
        Math.max(y + 10, isBanner ? 0 : ctaY),
        isBanner ? H - 135 : m.b - 215,
      ),
      spec.content.cta,
      isBanner ? 26 : 30,
      anchor === "middle" ? "middle" : "start",
    );
    if (fmt.kind !== "banner") {
      wordmark(x, m.b + 4, 34, ink, anchor);
      contactLine(x, m.b - 52, 28, muted, anchor);
    } else {
      contactLine(colX + 0, H - 26, 24, muted);
    }
    if (fmt.kind === "banner") visual(W * 0.7, 0, W * 0.3, H);
    else motif(m.r - 60, m.t + 60, 100, field);
  } else if (comp === "badge-offer") {
    rect(0, 0, W, H, field);
    const hf = fitText(
      headline,
      innerW,
      H * 0.28,
      baseSize * 1.4,
      baseSize * 0.6,
      headW,
      4,
      1,
    );
    const top = m.t + 30;
    eyebrow(m.l, top, accentOn(field));
    text("headline", hf.lines, m.l, top + 40 + hf.size, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      lh: 1,
      upper: isUpper,
      w: headW,
    });
    const by = top + 40 + hf.size * (hf.lines.length * 1) + 70;
    const R = Math.min(innerW * 0.3, 230);
    const cx = m.r - R - 10,
      cy = by + R;
    els.push(
      `<g transform="rotate(-8 ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="${R}" fill="${P.accent}"/><circle cx="${cx}" cy="${cy}" r="${R - 14}" fill="none" stroke="${readableOn(P.accent)}" stroke-width="3" stroke-dasharray="10 8"/></g>`,
    );
    if (spec.content.offer) {
      const of = fitText(
        spec.content.offer,
        R * 1.5,
        R * 1.1,
        Math.round(R * 0.5),
        26,
        v.w,
        3,
        1.05,
      );
      text(
        "offer",
        of.lines,
        cx,
        cy - (of.lines.length - 1) * of.size * 0.5 + of.size * 0.3,
        of.size,
        {
          family: v.display,
          weight: v.weight,
          fill: readableOn(P.accent),
          anchor: "middle",
          lh: 1.05,
          w: v.w,
          upper: isUpper,
        },
      );
    }
    if (hasMedia) visual(m.l, by, innerW - R * 1.6, Math.min(H * 0.28, 420));
    else plate(m.l, by, innerW - R * 1.6, Math.min(H * 0.28, 420));
    if (spec.content.subline) {
      const sf = fitText(
        spec.content.subline,
        innerW,
        140,
        Math.round(baseSize * 0.3),
        26,
        0.52,
        2,
        1.3,
      );
      text(
        "subline",
        sf.lines,
        m.l,
        by + Math.min(H * 0.28, 420) + 60 + sf.size,
        sf.size,
        { family: v.body, fill: muted, lh: 1.3, w: 0.52 },
      );
    }
    cta(m.l, m.b - 130, spec.content.cta);
    wordmark(m.r, m.b - 6, 32, ink, "end");
  } else if (comp === "ticker-banner") {
    rect(0, 0, W, H, field);
    const hf = fitText(
      headline,
      W * 0.62,
      H * 0.6,
      baseSize * 1.5,
      baseSize * 0.55,
      headW,
      3,
      1,
    );
    text("headline", hf.lines, m.l, m.t + 30 + hf.size, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      lh: 1,
      upper: isUpper,
      w: headW,
    });
    rect(0, H - 86, W, 86, btnBg);
    text(
      "ticker",
      [
        Array(8)
          .fill(spec.content.cta || spec.brand.name)
          .join("   •   "),
      ],
      20,
      H - 28,
      44,
      { family: v.display, weight: v.weight, fill: btnFg, upper: true, w: v.w },
    );
    visual(W * 0.72, 40, W * 0.22, H - 150);
  } else {
    // list-card
    rect(0, 0, W, H, field);
    const hf = fitText(
      headline,
      innerW,
      H * 0.2,
      baseSize * 1.25,
      baseSize * 0.55,
      headW,
      3,
      1.02,
    );
    eyebrow(m.l, m.t, accentOn(field));
    text("headline", hf.lines, m.l, m.t + 40 + hf.size, hf.size, {
      family: v.display,
      weight: v.weight,
      fill: ink,
      lh: 1.02,
      upper: isUpper,
      w: headW,
    });
    let y = m.t + 60 + hf.size * (hf.lines.length * 1.02) + 30;
    const rowH = Math.min(
      120,
      (m.b - y - 200) / Math.max(1, spec.content.bullets.length),
    );
    for (const [i, b] of spec.content.bullets.entries()) {
      rect(m.l, y, innerW, 2, mix(field, ink, 0.25));
      const bf = fitText(
        b,
        innerW - 110,
        rowH - 14,
        Math.round(baseSize * 0.42),
        26,
        v.w,
        1,
        1,
      );
      text(
        "bullet",
        [String(i + 1).padStart(2, "0")],
        m.l,
        y + rowH * 0.66,
        28,
        { family: v.body, weight: 600, fill: accentOn(field), w: 0.6 },
      );
      text("bullet", bf.lines, m.l + 90, y + rowH * 0.66, bf.size, {
        family: v.display,
        weight: v.weight,
        fill: ink,
        w: v.w,
        upper: isUpper,
      });
      y += rowH;
    }
    rect(m.l, y, innerW, 2, mix(field, ink, 0.25));
    cta(m.l, m.b - 120, spec.content.cta);
    contactLine(m.r, m.b - 60, 28, muted, "end");
    wordmark(m.r, m.b + 20, 28, muted, "end");
  }
  // The detail line (hours, date, place) sits in the top safe area on every composition that has room for it.
  if (spec.content.detail && comp !== "list-card" && comp !== "ticker-banner")
    text("detail", [spec.content.detail], m.l, m.t - 4, 28, {
      family: v.body,
      weight: 600,
      fill: photoLike ? "#ffffff" : muted,
      w: 0.56,
    });

  const total = bleed ? { w: W + bleed * 2, h: H + bleed * 2 } : { w: W, h: H };
  const open = bleed
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${total.w}" height="${total.h}" viewBox="${-bleed} ${-bleed} ${total.w} ${total.h}"><rect x="${-bleed}" y="${-bleed}" width="${total.w}" height="${total.h}" fill="${field}"/>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const svg = `${open}<defs>${defs.join("")}</defs>${els.join("")}</svg>`;
  return { svg, width: total.w, height: total.h, boxes };
}
