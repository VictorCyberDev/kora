import { mix } from "./color.js";
import type { Design } from "./spec.js";

/** Small deterministic PRNG so the same seed always yields the same artwork. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 100000) / 100000;
  };
}
const n = (v: number) => Math.round(v * 10) / 10;

/**
 * Abstract artwork drawn from the palette. It is the media fallback: no photo is
 * ever invented, nothing is hot-linked, and it costs a few hundred bytes.
 */
export function artSvg(
  design: Design,
  variant = 0,
  ratio: "wide" | "tall" | "square" = "wide",
): string {
  const p = design.palette;
  const r = rng(design.imagery.seed * 7919 + variant * 104729);
  const [w, h] =
    ratio === "wide" ? [800, 560] : ratio === "tall" ? [560, 760] : [640, 640];
  const c1 = p.primary,
    c2 = p.accent,
    c3 = p.secondary;
  const soft = mix(p.surfaceMuted, c1, 0.14);
  let body = "";
  switch (design.imagery.art) {
    case "mesh": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      for (let i = 0; i < 5; i++) {
        const col = [c1, c2, c3, mix(c1, c2, 0.5), p.surfaceRaised][i % 5]!;
        body += `<circle cx="${n(r() * w)}" cy="${n(r() * h)}" r="${n(120 + r() * 220)}" fill="${col}" opacity="${n(0.25 + r() * 0.4)}" filter="url(#b)"/>`;
      }
      return wrap(
        w,
        h,
        `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter></defs>${body}`,
      );
    }
    case "rings": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      const cx = n(w * (0.3 + r() * 0.4)),
        cy = n(h * (0.3 + r() * 0.4));
      for (let i = 9; i >= 1; i--)
        body += `<circle cx="${cx}" cy="${cy}" r="${i * 46}" fill="none" stroke="${i % 3 === 0 ? c2 : c1}" stroke-width="${i % 3 === 0 ? 3 : 1.5}" opacity="${n(0.2 + (9 - i) * 0.07)}"/>`;
      body += `<circle cx="${cx}" cy="${cy}" r="34" fill="${c1}"/>`;
      return wrap(w, h, body);
    }
    case "grid": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      const cell = 56;
      for (let x = 0; x < w; x += cell)
        for (let y = 0; y < h; y += cell) {
          const v = r();
          if (v > 0.62)
            body += `<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" rx="${design.shape === "sharp" ? 0 : 8}" fill="${v > 0.9 ? c2 : v > 0.78 ? c1 : c3}" opacity="${n(0.25 + v * 0.55)}"/>`;
          else
            body += `<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" rx="${design.shape === "sharp" ? 0 : 8}" fill="none" stroke="${p.border}"/>`;
        }
      return wrap(w, h, body);
    }
    case "waves": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      for (let i = 0; i < 6; i++) {
        const y = 140 + i * 66,
          a = 24 + r() * 40,
          ph = r() * 200;
        const col = [c1, c2, c3][i % 3]!;
        body += `<path d="M0 ${y} C ${n(w * 0.25 + ph * 0.2)} ${n(y - a)}, ${n(w * 0.5)} ${n(y + a)}, ${n(w * 0.75 - ph * 0.1)} ${n(y - a * 0.6)} S ${w} ${y} ${w} ${y} L ${w} ${h} L 0 ${h} Z" fill="${col}" opacity="${n(0.1 + i * 0.07)}"/>`;
      }
      return wrap(w, h, body);
    }
    case "blocks": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      const rr =
        design.shape === "sharp" ? 0 : design.shape === "soft" ? 14 : 40;
      body += `<rect x="${n(w * 0.08)}" y="${n(h * 0.14)}" width="${n(w * 0.44)}" height="${n(h * 0.62)}" rx="${rr}" fill="${c1}"/>`;
      body += `<rect x="${n(w * 0.42)}" y="${n(h * 0.3)}" width="${n(w * 0.38)}" height="${n(h * 0.5)}" rx="${rr}" fill="${c2}" opacity=".92"/>`;
      body += `<rect x="${n(w * 0.62)}" y="${n(h * 0.08)}" width="${n(w * 0.26)}" height="${n(h * 0.3)}" rx="${rr}" fill="${c3}" opacity=".85"/>`;
      body += `<circle cx="${n(w * (0.2 + r() * 0.2))}" cy="${n(h * 0.86)}" r="${n(30 + r() * 30)}" fill="${p.surfaceRaised}" opacity=".9"/>`;
      return wrap(w, h, body);
    }
    case "arch": {
      body += `<rect width="${w}" height="${h}" fill="${soft}"/>`;
      const bw = w / 4;
      for (let i = 0; i < 3; i++) {
        const x = w * 0.12 + i * (bw + 22),
          top = h * (0.16 + i * 0.07);
        const col = [c1, c2, c3][(i + (design.imagery.seed % 3)) % 3]!;
        body += `<path d="M${n(x)} ${h} V ${n(top + bw / 2)} A ${n(bw / 2)} ${n(bw / 2)} 0 0 1 ${n(x + bw)} ${n(top + bw / 2)} V ${h} Z" fill="${col}" opacity="${n(0.55 + i * 0.2)}"/>`;
      }
      body += `<circle cx="${n(w * 0.84)}" cy="${n(h * 0.2)}" r="42" fill="${c2}" opacity=".8"/>`;
      return wrap(w, h, body);
    }
  }
}
const wrap = (w: number, h: number, inner: string) =>
  `<svg class="art" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
