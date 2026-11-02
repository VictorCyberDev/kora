import { ensureContrast, mix, readableOn, type Colorway } from "@kora/creative";
import { paletteSchema, type Palette } from "../v2/spec.js";

/** Expands a five-colour colourway into the 17 roles the spec requires; every text pair is checked at 4.5:1. */
export function paletteFromColorway(c: Colorway): Palette {
  const dark = c.mode === "dark";
  const bg = c.bg;
  const surface = dark ? mix(bg, "#ffffff", 0.05) : mix(bg, "#ffffff", 0.5);
  const surfaceRaised = dark
    ? mix(bg, "#ffffff", 0.09)
    : mix(bg, "#ffffff", 0.85);
  const surfaceMuted = dark
    ? mix(bg, c.primary, 0.14)
    : mix(bg, c.primary, 0.08);
  const fg = ensureContrast(
    ensureContrast(
      ensureContrast(ensureContrast(c.fg, bg), surface),
      surfaceRaised,
    ),
    surfaceMuted,
  );
  const mf = ensureContrast(
    ensureContrast(ensureContrast(mix(fg, bg, 0.36), bg), surfaceMuted),
    surfaceRaised,
  );
  return paletteSchema.parse({
    background: bg,
    foreground: fg,
    surface,
    surfaceRaised,
    surfaceMuted,
    primary: c.primary,
    primaryForeground: readableOn(c.primary),
    secondary: c.secondary,
    secondaryForeground: readableOn(c.secondary),
    accent: c.accent,
    accentForeground: readableOn(c.accent),
    muted: mix(bg, fg, 0.5),
    mutedForeground: mf,
    border: mix(bg, fg, dark ? 0.22 : 0.16),
    success: "#2f8f5b",
    warning: "#c98a1b",
    danger: "#c2410c",
  });
}
