import { ensureContrast, mix, readableOn, shiftHue } from "./color.js";
import { paletteSchema, type Palette } from "./spec.js";

interface Seed {
  mode: "light" | "dark";
  bg: string;
  fg: string;
  primary: string;
  secondary: string;
  accent: string;
}

/** Curated colourways. Each is a considered set; the planner only varies hue slightly per business. */
export const PALETTE_STRATEGIES = {
  "ink-paper": {
    mode: "light",
    bg: "#f6f3ee",
    fg: "#1b1a17",
    primary: "#1b1a17",
    secondary: "#8a7f6d",
    accent: "#c8553d",
  },
  "terracotta-sand": {
    mode: "light",
    bg: "#f7efe6",
    fg: "#2b1d14",
    primary: "#7a3b22",
    secondary: "#b88a5a",
    accent: "#d9822b",
  },
  botanical: {
    mode: "light",
    bg: "#f3f1e8",
    fg: "#16241c",
    primary: "#1f4d3a",
    secondary: "#7d9a6b",
    accent: "#c19a3d",
  },
  "midnight-brass": {
    mode: "dark",
    bg: "#0f1420",
    fg: "#f2efe8",
    primary: "#d4af6a",
    secondary: "#3a4a6b",
    accent: "#e8cf9a",
  },
  "clinic-teal": {
    mode: "light",
    bg: "#fbfdfd",
    fg: "#0f2a2e",
    primary: "#0e7c86",
    secondary: "#cfe9ea",
    accent: "#f2a65a",
  },
  "contrast-pop": {
    mode: "light",
    bg: "#fff8ec",
    fg: "#111111",
    primary: "#111111",
    secondary: "#ffd23f",
    accent: "#ff5a36",
  },
  "coastal-navy": {
    mode: "light",
    bg: "#f4f8fb",
    fg: "#0d2236",
    primary: "#12355b",
    secondary: "#7fb3d5",
    accent: "#ff7a59",
  },
  "plum-blush": {
    mode: "light",
    bg: "#fbf1f1",
    fg: "#2a1420",
    primary: "#5b1f45",
    secondary: "#e8b4bc",
    accent: "#d94f70",
  },
  workshop: {
    mode: "light",
    bg: "#f4f4f2",
    fg: "#1d2023",
    primary: "#26292d",
    secondary: "#8b9096",
    accent: "#f26a1b",
  },
  "indigo-tech": {
    mode: "light",
    bg: "#f8f9ff",
    fg: "#12132b",
    primary: "#3b3fd8",
    secondary: "#cfd3ff",
    accent: "#12b8a6",
  },
  "tomato-cream": {
    mode: "light",
    bg: "#fff6e8",
    fg: "#2a1710",
    primary: "#c0392b",
    secondary: "#f0b23e",
    accent: "#1f6f50",
  },
  "forest-night": {
    mode: "dark",
    bg: "#0e1a15",
    fg: "#eaf2ec",
    primary: "#7bd3a0",
    secondary: "#1f3a2e",
    accent: "#e3c46d",
  },
  "graphite-lime": {
    mode: "dark",
    bg: "#101113",
    fg: "#f3f4f0",
    primary: "#c6f24e",
    secondary: "#2b2e33",
    accent: "#ff6b4a",
  },
  "sage-linen": {
    mode: "light",
    bg: "#f2f4ee",
    fg: "#222a24",
    primary: "#4f6b57",
    secondary: "#cbd5c2",
    accent: "#b5651d",
  },
  "royal-ivory": {
    mode: "light",
    bg: "#fbf8f1",
    fg: "#1a1630",
    primary: "#2f2a6b",
    secondary: "#c9b98a",
    accent: "#a2762b",
  },
  sunrise: {
    mode: "light",
    bg: "#fffaf0",
    fg: "#26210f",
    primary: "#b85c00",
    secondary: "#ffe3b0",
    accent: "#146c63",
  },
} as const satisfies Record<string, Seed>;
export type PaletteStrategy = keyof typeof PALETTE_STRATEGIES;
export const PALETTE_STRATEGY_IDS = Object.keys(
  PALETTE_STRATEGIES,
) as PaletteStrategy[];

export function buildPalette(
  strategy: PaletteStrategy,
  hueShift = 0,
): { palette: Palette; mode: "light" | "dark" } {
  const s: Seed = PALETTE_STRATEGIES[strategy];
  const dark = s.mode === "dark";
  const primary = shiftHue(s.primary, hueShift);
  const accent = shiftHue(s.accent, -hueShift);
  const secondary = shiftHue(s.secondary, hueShift);
  const bg = s.bg,
    fg = s.fg;
  const surface = dark ? mix(bg, "#ffffff", 0.04) : mix(bg, "#ffffff", 0.55);
  const surfaceRaised = dark ? mix(bg, "#ffffff", 0.08) : "#ffffff";
  const surfaceMuted = dark ? mix(bg, primary, 0.1) : mix(bg, primary, 0.07);
  const mutedBase = mix(fg, bg, 0.38);
  const mutedForeground = ensureContrast(
    ensureContrast(mutedBase, bg),
    surfaceMuted,
  );
  const raw = {
    background: bg,
    foreground: fg,
    surface,
    surfaceRaised,
    surfaceMuted,
    primary,
    primaryForeground: readableOn(primary),
    secondary,
    secondaryForeground: readableOn(secondary),
    accent,
    accentForeground: readableOn(accent),
    muted: mix(bg, fg, 0.5),
    mutedForeground,
    border: mix(bg, fg, dark ? 0.2 : 0.14),
    success: "#2f8f5b",
    warning: "#c98a1b",
    danger: "#c2410c",
  };
  // foreground must also hold on raised/muted surfaces; nudge if a strategy ever drifts
  raw.foreground = ensureContrast(
    ensureContrast(ensureContrast(fg, bg), surfaceRaised),
    surfaceMuted,
  );
  return { palette: paletteSchema.parse(raw), mode: s.mode };
}
