/** M14: static asset quality. Reads a rendered SVG and holds it to the Brand Genome, not to taste. */
import { contrast } from "@kora/site-schema";
import type { Genome } from "./genome.js";

export interface AssetFinding {
  rule: string;
  severity: "block" | "warn";
  message: string;
}

const HEX = /#[0-9a-fA-F]{6}\b/g;
const lc = (s: string) => s.toLowerCase();

export function staticAssetQuality(
  svg: string,
  g: Pick<Genome, "visual" | "verbal">,
  opts: {
    width: number;
    height: number;
    minFontPx?: number;
    maxWords?: number;
  } = { width: 1080, height: 1080 },
): AssetFinding[] {
  const out: AssetFinding[] = [];
  const add = (rule: string, severity: "block" | "warn", message: string) =>
    out.push({ rule, severity, message });
  const allowed = new Set(
    [
      g.visual.ink,
      g.visual.canvas,
      g.visual.primary,
      g.visual.accent,
      "#ffffff",
      "#000000",
    ].map(lc),
  );
  const used = [...new Set((svg.match(HEX) ?? []).map(lc))];
  const off = used.filter((c) => !allowed.has(c));
  if (off.length > 3)
    add(
      "off-palette",
      "warn",
      `${off.length} colours are outside the brand palette (${off.slice(0, 3).join(", ")}…).`,
    );

  const texts = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)];
  if (texts.length === 0)
    add(
      "no-text",
      "warn",
      "The asset carries no text, so it cannot say anything.",
    );
  const words = texts
    .map((t) => t[1]!.replace(/<[^>]+>/g, " "))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  if (words > (opts.maxWords ?? 40))
    add(
      "too-much-text",
      "warn",
      `${words} words; keep a social asset under ${opts.maxWords ?? 40}.`,
    );

  const min = opts.minFontPx ?? Math.round(opts.width / 36);
  for (const m of svg.matchAll(/font-size="(\d+(?:\.\d+)?)"/g))
    if (Number(m[1]) < min) {
      add(
        "small-text",
        "block",
        `Text of ${m[1]}px is below the ${min}px minimum for this size.`,
      );
      break;
    }

  const families = [...svg.matchAll(/font-family="([^"]+)"/g)].map((m) =>
    m[1]!.split(",")[0]!.replace(/['"]/g, "").trim(),
  );
  const ok = new Set([g.visual.displayFamily, g.visual.bodyFamily].map(lc));
  const bad = families.filter((f) => !ok.has(lc(f)));
  if (bad.length)
    add(
      "off-brand-font",
      "warn",
      `Font "${bad[0]}" is not one of the brand fonts.`,
    );

  const bg = svg.match(
    /<rect[^>]*width="\d+"[^>]*height="\d+"[^>]*fill="(#[0-9a-fA-F]{6})"/,
  )?.[1];
  const fg = svg.match(/<text[^>]*fill="(#[0-9a-fA-F]{6})"/)?.[1];
  if (bg && fg && contrast(fg, bg) < 4.5)
    add(
      "contrast",
      "block",
      `Text on its background has contrast ${contrast(fg, bg).toFixed(1)}:1; needs 4.5:1.`,
    );

  for (const m of svg.matchAll(
    /<text[^>]*\bx="(-?\d+(?:\.\d+)?)"[^>]*\by="(-?\d+(?:\.\d+)?)"/g,
  )) {
    const x = Number(m[1]),
      y = Number(m[2]);
    const margin = opts.width * 0.04;
    if (
      x < margin * 0.5 ||
      y < margin * 0.5 ||
      y > opts.height - margin * 0.5
    ) {
      add(
        "safe-area",
        "warn",
        "Text sits inside the outer 4% edge where platforms crop.",
      );
      break;
    }
  }
  for (const w of g.verbal.avoid)
    if (
      w &&
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
        texts.map((t) => t[1]).join(" "),
      )
    )
      add(
        "avoid-word",
        "block",
        `Uses "${w}", which the owner asked Kora to avoid.`,
      );
  return out;
}
