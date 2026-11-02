import type { Palette } from "../v2/spec.js";
import { PLATE_KINDS } from "./spec.js";

export type PlateKind = (typeof PLATE_KINDS)[number];

const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const pick = <T>(r: () => number, a: readonly T[]): T =>
  a[Math.floor(r() * a.length)]!;

/**
 * Procedural plates: flat, geometric, poster-like graphics drawn from the brand palette. They stand in where there is
 * no real photograph, deliberately looking like graphic design and not like a photo of something that is not theirs.
 * Pure function of (kind, seed, palette): no randomness, no external input, no text content except a monogram letter.
 */
export function plateSvg(
  kind: PlateKind,
  seed: number,
  p: Palette,
  letter = "K",
): string {
  const r = rng(seed + 11);
  const cols = [p.primary, p.secondary, p.accent, p.surfaceMuted];
  const A = pick(r, [p.primary, p.secondary]);
  const B = pick(r, [p.accent, p.secondary, p.surfaceMuted]);
  const C = p.accent;
  const open = `<svg class="plate" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">`;
  const bg = `<rect width="400" height="500" fill="${p.surfaceMuted}"/>`;
  let body = "";
  if (kind === "arch") {
    body = `${bg}<path d="M60 500V220a140 140 0 0 1 280 0V500z" fill="${A}"/><path d="M110 500V230a90 90 0 0 1 180 0V500z" fill="${B}"/><circle cx="200" cy="150" r="${40 + Math.floor(r() * 20)}" fill="${C}"/>`;
  } else if (kind === "stripes") {
    const n = 7 + Math.floor(r() * 4);
    body =
      bg +
      Array.from(
        { length: n },
        (_, i) =>
          `<rect x="${(400 / n) * i}" y="0" width="${400 / n / 2}" height="500" fill="${cols[i % 3]}"/>`,
      ).join("") +
      `<circle cx="${120 + Math.floor(r() * 160)}" cy="${150 + Math.floor(r() * 200)}" r="70" fill="${p.background}"/>`;
  } else if (kind === "circles") {
    body =
      bg +
      Array.from(
        { length: 5 },
        (_, i) =>
          `<circle cx="${60 + r() * 280}" cy="${60 + r() * 380}" r="${40 + r() * 90}" fill="${cols[i % 3]}" opacity="${0.85 - i * 0.08}"/>`,
      ).join("");
  } else if (kind === "checker") {
    const s = 50;
    body =
      bg +
      Array.from({ length: 80 }, (_, i) =>
        ((i % 8) + Math.floor(i / 8)) % 2
          ? ""
          : `<rect x="${(i % 8) * s}" y="${Math.floor(i / 8) * s}" width="${s}" height="${s}" fill="${A}"/>`,
      ).join("") +
      `<circle cx="200" cy="250" r="90" fill="${C}"/>`;
  } else if (kind === "sunburst") {
    const n = 14;
    body =
      `<rect width="400" height="500" fill="${B}"/>` +
      Array.from({ length: n }, (_, i) => {
        const a = (Math.PI * 2 * i) / n,
          a2 = a + Math.PI / n;
        return `<path d="M200 300L${200 + Math.cos(a) * 600} ${300 + Math.sin(a) * 600}L${200 + Math.cos(a2) * 600} ${300 + Math.sin(a2) * 600}z" fill="${A}"/>`;
      }).join("") +
      `<circle cx="200" cy="300" r="60" fill="${C}"/>`;
  } else if (kind === "lines") {
    body =
      bg +
      Array.from(
        { length: 9 },
        (_, i) =>
          `<path d="M0 ${60 + i * 48}C100 ${20 + i * 48} 300 ${100 + i * 48} 400 ${60 + i * 48}" fill="none" stroke="${i % 3 === 0 ? C : A}" stroke-width="${i % 3 === 0 ? 6 : 3}"/>`,
      ).join("");
  } else if (kind === "monogram") {
    const ch = (letter.trim()[0] ?? "K")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "K");
    body = `<rect width="400" height="500" fill="${A}"/><circle cx="200" cy="250" r="150" fill="none" stroke="${C}" stroke-width="4"/><text x="200" y="305" text-anchor="middle" font-size="190" font-family="serif" fill="${C}">${ch}</text>`;
  } else {
    body =
      bg +
      Array.from(
        { length: 4 },
        (_, i) =>
          `<rect x="${40 + i * 20}" y="${60 + i * 90}" width="${320 - i * 40}" height="70" rx="0" fill="${cols[i % 3]}"/>`,
      ).join("");
  }
  return `${open}${body}</svg>`;
}
