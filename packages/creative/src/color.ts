/** Colour maths: WCAG contrast and HSL-based palette helpers. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
export function hsl(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) =>
    ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/**
 * Moves `fg` towards black or white until it reaches `min` contrast on `bg`. Tries the natural direction first and
 * the other when that cannot reach the target (a mid-tone background like orange needs dark text, not white).
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const [r, g, b] = hexToRgb(fg);
  const attempt = (m: number) => {
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const c = rgbToHex(r + (m - r) * t, g + (m - g) * t, b + (m - b) * t);
      if (contrast(c, bg) >= min) return c;
    }
    return null;
  };
  const first = luminance(bg) < 0.4 ? 255 : 0;
  const ok = attempt(first) ?? attempt(255 - first);
  if (ok) return ok;
  return contrast("#000000", bg) >= contrast("#ffffff", bg)
    ? "#000000"
    : "#ffffff";
}
/** Readable text colour (near-black or white) on a background; always >= 4.5 when achievable. */
export const readableOn = (bg: string, ink = "#111827", paper = "#ffffff") => {
  const best = contrast(ink, bg) >= contrast(paper, bg) ? ink : paper;
  if (contrast(best, bg) >= 4.5) return best;
  return contrast("#000000", bg) >= contrast("#ffffff", bg)
    ? "#000000"
    : "#ffffff";
};
export const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

/**
 * A colour close to `c` that reaches `min` contrast on EVERY surface it can land on (a section background and the card
 * sitting on it). Fitting surfaces one after another can land on a grey that fails on both; this searches both
 * directions and takes the nearest colour that satisfies all of them, else the best pure black or white.
 */
export function legibleOnAll(c: string, surfaces: string[], min = 4.5): string {
  const worst = (x: string) => Math.min(...surfaces.map((s) => contrast(x, s)));
  if (worst(c) >= min) return c;
  const [r, g, b] = hexToRgb(c);
  const steps: string[] = [];
  for (let t = 0.05; t <= 1.0001; t += 0.05)
    for (const m of [255, 0])
      steps.push(rgbToHex(r + (m - r) * t, g + (m - g) * t, b + (m - b) * t));
  const ok = steps.find((x) => worst(x) >= min);
  if (ok) return ok;
  return worst("#000000") >= worst("#ffffff") ? "#000000" : "#ffffff";
}
