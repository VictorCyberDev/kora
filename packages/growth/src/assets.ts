import { z } from "zod";
import { contrast, ensureContrast } from "@kora/site-schema";
import type { BrandKit } from "./brand.js";

export const ASSET_FORMATS = {
  square: { label: "Square post", width: 1080, height: 1080 },
  portrait: { label: "Portrait post", width: 1080, height: 1350 },
  story: { label: "Story / reel cover", width: 1080, height: 1920 },
  whatsapp_promo: { label: "WhatsApp promo", width: 1200, height: 900 },
  landscape: { label: "Landscape", width: 1200, height: 628 },
  flyer: { label: "Flyer (A5)", width: 1480, height: 2100 },
} as const;
export type AssetFormat = keyof typeof ASSET_FORMATS;
export const ASSET_FORMAT_IDS = Object.keys(ASSET_FORMATS) as [
  AssetFormat,
  ...AssetFormat[],
];

export const ASSET_CATEGORIES = [
  "offer",
  "service",
  "hours",
  "announcement",
  "welcome",
  "quote",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export const ASSET_LAYOUTS = ["bold", "clean", "split"] as const;
export type AssetLayout = (typeof ASSET_LAYOUTS)[number];
export const COLORWAYS = ["primary", "ink", "accent", "canvas"] as const;

const line = (n: number) => z.string().trim().max(n);
/** The only things an owner can change on a branded asset. Layout geometry, fonts and colors stay with the kit. */
export const AssetSpecSchema = z
  .object({
    format: z.enum(ASSET_FORMAT_IDS),
    category: z.enum(ASSET_CATEGORIES),
    layout: z.enum(ASSET_LAYOUTS).default("bold"),
    colorway: z.enum(COLORWAYS).default("primary"),
    headline: line(60).min(1),
    subline: line(140).default(""),
    detail: line(80).default(""),
    cta: line(28).default(""),
    showContact: z.boolean().default(true),
    contact: line(60).default(""),
  })
  .strict();
export type AssetSpec = z.infer<typeof AssetSpecSchema>;

const BUNDLED = new Set([
  "Playfair Display",
  "DM Sans",
  "Cormorant Garamond",
  "Manrope",
  "Inter",
  "Lora",
  "Plus Jakarta Sans",
  "Outfit",
  "Nunito",
  "Space Grotesk",
  "JetBrains Mono",
  "DM Serif Display",
  "Bricolage Grotesque",
  "Syne",
]);
/** Fonts the renderer actually has; anything else renders in Inter rather than an unpredictable system face. */
export const resolveFont = (family: string) =>
  BUNDLED.has(family) ? family : "Inter";

export const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Greedy word wrap using an average glyph width; returns at most `maxLines` lines, truncating with an ellipsis. */
export function wrap(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  avg = 0.52,
): string[] {
  const per = Math.max(1, Math.floor(maxWidth / (fontSize * avg)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= per) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > per ? `${w.slice(0, per - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] =
      `${kept[maxLines - 1]!.replace(/…$/, "").slice(0, Math.max(1, per - 1))}…`;
    return kept;
  }
  return lines;
}

/** Largest font size (stepping down) at which the text fits within the box. */
export function fit(
  text: string,
  maxWidth: number,
  maxLines: number,
  start: number,
  min: number,
): { size: number; lines: string[] } {
  for (let s = start; s >= min; s -= 4) {
    const lines = wrap(text, s, maxWidth, 99);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  return { size: min, lines: wrap(text, min, maxWidth, maxLines) };
}

export interface Palette {
  bg: string;
  fg: string;
  accent: string;
  accentFg: string;
  muted: string;
}
export function paletteFor(
  kit: BrandKit,
  colorway: (typeof COLORWAYS)[number],
  layout: AssetLayout,
): Palette {
  const c = kit.colors;
  const base =
    colorway === "primary"
      ? { bg: c.primary, fg: c.primaryText }
      : colorway === "accent"
        ? { bg: c.accent, fg: c.accentText }
        : colorway === "ink"
          ? { bg: c.ink, fg: ensureContrast(c.canvas, c.ink) }
          : { bg: c.canvas, fg: c.ink };
  const accent = base.bg === c.accent ? c.primary : c.accent;
  const fg = ensureContrast(base.fg, base.bg);
  return {
    bg: layout === "clean" && colorway !== "canvas" ? c.canvas : base.bg,
    fg:
      layout === "clean" && colorway !== "canvas"
        ? ensureContrast(c.ink, c.canvas)
        : fg,
    accent: layout === "clean" && colorway !== "canvas" ? base.bg : accent,
    accentFg: ensureContrast(
      layout === "clean" && colorway !== "canvas"
        ? base.fg
        : accent === c.accent
          ? c.accentText
          : c.primaryText,
      layout === "clean" && colorway !== "canvas" ? base.bg : accent,
    ),
    muted: ensureContrast(
      c.muted,
      layout === "clean" && colorway !== "canvas" ? c.canvas : base.bg,
      4.5,
    ),
  };
}

export interface RenderedAsset {
  svg: string;
  width: number;
  height: number;
  kitVersion: number;
}

export interface StackBlock {
  text: string;
  start: number;
  min: number;
  maxLines: number;
  weight: number;
  family: string;
  lh: number;
  /** space after the block, as a multiple of its font size */
  gap: number;
}
export interface PlacedBlock {
  lines: string[];
  size: number;
  y: number;
  block: StackBlock;
}

/**
 * Places text blocks top-down inside [top, bottom]. Every block scales together until the stack fits; if it still
 * cannot fit at minimum sizes the longest block loses lines. Nothing can overlap or leave the region.
 */
export function layoutStack(
  blocks: StackBlock[],
  width: number,
  top: number,
  bottom: number,
): PlacedBlock[] {
  const avail = Math.max(0, bottom - top);
  const measure = (scale: number, cap: number | null) => {
    let h = 0;
    const out = blocks.map((b) => {
      const size = Math.max(
        Math.round(b.min * Math.min(1, scale * 1.0)),
        Math.round(b.start * scale),
      );
      const lines = wrap(
        b.text,
        size,
        width,
        cap === null ? 99 : Math.max(1, Math.min(cap, b.maxLines)),
      );
      const used = lines.slice(0, b.maxLines);
      const ellipsized =
        lines.length > b.maxLines
          ? wrap(b.text, size, width, b.maxLines)
          : used;
      h += ellipsized.length * size * b.lh + b.gap * size;
      return { lines: ellipsized, size, block: b };
    });
    return { out, h: h - (blocks.at(-1)?.gap ?? 0) * (out.at(-1)?.size ?? 0) };
  };
  let chosen = measure(0.35, null);
  for (let sc = 1; sc >= 0.35; sc -= 0.03) {
    const m = measure(sc, null);
    if (m.h <= avail) {
      chosen = m;
      break;
    }
    chosen = m;
  }
  // still too tall at minimum sizes: trim lines from the largest blocks
  for (let guard = 0; chosen.h > avail && guard < 40; guard++) {
    const idx = chosen.out.reduce(
      (best, b, k) =>
        b.lines.length > (chosen.out[best]?.lines.length ?? 0) ? k : best,
      0,
    );
    const b = chosen.out[idx]!;
    if (b.lines.length <= 1) break;
    const kept = b.lines.slice(0, b.lines.length - 1);
    kept[kept.length - 1] = `${kept[kept.length - 1]!.replace(/…$/, "")}…`;
    chosen.h -= b.size * b.block.lh;
    b.lines = kept;
  }
  let y = top;
  return chosen.out.map((b) => {
    const placed = {
      lines: b.lines,
      size: b.size,
      y: Math.round(y + b.size),
      block: b.block,
    };
    y += b.lines.length * b.size * b.block.lh + b.block.gap * b.size;
    return placed;
  });
}

export const textEls = (x: number, p: PlacedBlock, fill: string) =>
  p.lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${Math.round(p.y + i * p.size * p.block.lh)}" font-family="${xml(p.block.family)}" font-size="${p.size}" font-weight="${p.block.weight}" fill="${fill}">${xml(l)}</text>`,
    )
    .join("");

/** Deterministic SVG for a branded asset. Same spec + same kit version always produces identical bytes. */
export function renderAssetSvg(
  spec: AssetSpec,
  kit: BrandKit,
  business: string,
  kitVersion: number,
): RenderedAsset {
  const { width: W, height: H } = ASSET_FORMATS[spec.format];
  const tall = H / W > 1.2;
  const wide = W / H > 1.5;
  const pad = Math.round(Math.min(W, H) * 0.08);
  const inner = W - pad * 2;
  const p = paletteFor(kit, spec.colorway, spec.layout);
  const display = resolveFont(kit.typography.displayFamily);
  const body = resolveFont(kit.typography.bodyFamily);
  const radius = kit.shape === "sharp" ? 0 : kit.shape === "rounded" ? 40 : 14;
  const unit = Math.min(W, H * (wide ? 1.6 : 1));
  const els: string[] = [];

  // footer: CTA button over the contact line, anchored to the bottom
  const cs = Math.round(unit * 0.034);
  const ch = Math.round(cs * 2.2);
  const k = Math.round(unit * 0.03);
  const hasCta = Boolean(spec.cta);
  const hasContact = Boolean(spec.showContact && spec.contact);
  const footerH =
    (hasCta ? ch : 0) +
    (hasContact ? k * 1.4 : 0) +
    (hasCta && hasContact ? Math.round(cs * 0.6) : 0);
  const footerTop = H - pad - footerH;
  const split = spec.layout === "split";
  const bandTop = split ? footerTop - Math.round(pad * 0.7) : H;
  const onBand = split
    ? {
        fg: ensureContrast(p.accentFg, p.accent),
        fill: p.bg,
        fillFg: ensureContrast(p.fg, p.bg),
      }
    : { fg: p.fg, fill: p.accent, fillFg: p.accentFg };

  els.push(`<rect width="${W}" height="${H}" fill="${p.bg}"/>`);
  if (spec.layout === "bold")
    els.push(
      `<circle cx="${W * 0.92}" cy="${H * 0.08}" r="${unit * 0.3}" fill="${p.accent}" opacity="0.22"/>`,
    );
  else if (split)
    els.push(
      `<rect x="0" y="${bandTop}" width="${W}" height="${H - bandTop}" fill="${p.accent}"/>`,
    );
  else
    els.push(
      `<rect x="0" y="0" width="${Math.round(unit * 0.03)}" height="${H}" fill="${p.accent}"/>`,
    );

  const wm = fit(
    business,
    inner * 0.8,
    1,
    Math.round(unit * 0.034),
    Math.round(unit * 0.024),
  );
  els.push(
    `<text x="${pad}" y="${pad + wm.size}" font-family="${xml(body)}" font-size="${wm.size}" font-weight="700" fill="${p.fg}">${xml(wm.lines[0] ?? business)}</text>`,
  );
  const ruleY = pad + wm.size + Math.round(unit * 0.018);
  if (spec.layout === "bold")
    els.push(
      `<rect x="${pad}" y="${ruleY}" width="${Math.round(unit * 0.12)}" height="10" rx="5" fill="${p.accent}"/>`,
    );

  const blocks: StackBlock[] = [
    {
      text: spec.headline,
      start: Math.round(unit * (tall ? 0.115 : wide ? 0.085 : 0.095)),
      min: Math.round(unit * 0.04),
      maxLines: tall ? 5 : 3,
      weight: 700,
      family: display,
      lh: 1.08,
      gap: 0.45,
    },
    ...(spec.subline
      ? [
          {
            text: spec.subline,
            start: Math.round(unit * 0.038),
            min: Math.round(unit * 0.026),
            maxLines: tall ? 5 : 3,
            weight: 400,
            family: body,
            lh: 1.3,
            gap: 0.6,
          },
        ]
      : []),
    ...(spec.detail
      ? [
          {
            text: spec.detail,
            start: Math.round(unit * 0.04),
            min: Math.round(unit * 0.028),
            maxLines: 2,
            weight: 700,
            family: body,
            lh: 1.2,
            gap: 0,
          },
        ]
      : []),
  ];
  const bodyTop = ruleY + Math.round(unit * (tall ? 0.09 : 0.04));
  const bodyBottom = (split ? bandTop : footerTop) - Math.round(unit * 0.03);
  // tall formats start the stack lower, like a poster; short formats start right under the wordmark
  const offset = tall
    ? Math.round(Math.max(0, bodyBottom - bodyTop) * 0.12)
    : 0;
  for (const b of layoutStack(blocks, inner, bodyTop + offset, bodyBottom))
    els.push(textEls(pad, b, p.fg));

  let fy = footerTop;
  if (hasCta) {
    const bw = Math.min(inner, Math.round(spec.cta.length * cs * 0.6 + cs * 2));
    els.push(
      `<rect x="${pad}" y="${fy}" width="${bw}" height="${ch}" rx="${Math.min(radius, cs)}" fill="${onBand.fill}"/>`,
    );
    els.push(
      `<text x="${pad + cs}" y="${fy + Math.round(cs * 1.52)}" font-family="${xml(body)}" font-size="${cs}" font-weight="700" fill="${onBand.fillFg}">${xml(spec.cta.slice(0, 28))}</text>`,
    );
    fy += ch + (hasContact ? Math.round(cs * 0.6) : 0);
  }
  if (hasContact)
    els.push(
      `<text x="${pad}" y="${fy + k}" font-family="${xml(body)}" font-size="${k}" font-weight="400" fill="${onBand.fg}">${xml(spec.contact.slice(0, 60))}</text>`,
    );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${xml(spec.headline)}">${els.join("")}</svg>`;
  return { svg, width: W, height: H, kitVersion };
}

export interface AssetIssue {
  severity: "block" | "warn";
  message: string;
}
/** Checks a spec against the business and the kit before it is rendered. */
export function validateAssetSpec(
  spec: AssetSpec,
  kit: BrandKit,
  facts: { contacts: string[]; expiredTitles: string[] },
): AssetIssue[] {
  const out: AssetIssue[] = [];
  const p = paletteFor(kit, spec.colorway, spec.layout);
  if (contrast(p.fg, p.bg) < 4.5)
    out.push({
      severity: "block",
      message: "This colorway is not readable with your Brand Kit.",
    });
  if (
    spec.contact &&
    !facts.contacts.some(
      (c) =>
        c.replace(/\D/g, "") &&
        spec.contact.replace(/\D/g, "").includes(c.replace(/\D/g, "")),
    ) &&
    /\d{6,}/.test(spec.contact.replace(/\D/g, ""))
  )
    out.push({
      severity: "block",
      message: "The contact number is not one of your numbers.",
    });
  const t = `${spec.headline} ${spec.subline} ${spec.detail}`.toLowerCase();
  for (const e of facts.expiredTitles)
    if (e && t.includes(e.toLowerCase()))
      out.push({ severity: "block", message: `"${e}" has ended.` });
  return out;
}
