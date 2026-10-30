import { z } from "zod";
import {
  PAIRINGS,
  contrast,
  ensureContrast,
  type AnySiteSpec,
} from "@kora/site-schema";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BRAND_VOICES = [
  "warm",
  "professional",
  "playful",
  "premium",
  "direct",
] as const;
export type BrandVoice = (typeof BRAND_VOICES)[number];

export const BrandKitSchema = z.object({
  /** Logo is only ever an uploaded asset id or absent — Kora does not draw a logo and call it yours. */
  logoAssetId: z.string().max(80).nullable().default(null),
  colors: z.object({
    ink: hex,
    canvas: hex,
    primary: hex,
    primaryText: hex,
    accent: hex,
    accentText: hex,
    muted: hex,
  }),
  typography: z.object({
    pairing: z.string().max(40),
    displayFamily: z.string().max(80),
    bodyFamily: z.string().max(80),
  }),
  shape: z.enum(["sharp", "soft", "rounded"]).default("soft"),
  voice: z.object({
    tone: z.enum(BRAND_VOICES).default("warm"),
    /** Words the owner wants used / never used in generated copy. */
    use: z.array(z.string().max(40)).max(12).default([]),
    avoid: z.array(z.string().max(40)).max(12).default([]),
    language: z.string().max(20).default("en"),
  }),
  imagery: z.object({
    style: z.enum(["abstract", "photo-led", "minimal"]).default("abstract"),
    seed: z.number().int().min(0).max(999_999).default(1),
  }),
});
export type BrandKit = z.infer<typeof BrandKitSchema>;

const VOICE_BY_PERSONALITY: Record<string, BrandVoice> = {
  luxury: "premium",
  premium: "premium",
  elegant: "premium",
  playful: "playful",
  energetic: "playful",
  warm: "warm",
  approachable: "warm",
  local: "warm",
  organic: "warm",
  artisanal: "warm",
  technical: "direct",
  minimal: "direct",
  corporate: "professional",
  trustworthy: "professional",
  editorial: "professional",
};

/** Derives a brand kit from what a published site already uses, so the website and marketing share one identity. */
export function deriveBrandKit(spec: AnySiteSpec): BrandKit {
  if (spec.version === 2) {
    const d = spec.design;
    const p = d.palette;
    const pairing = PAIRINGS[d.typography.pairing];
    const voice =
      d.personality
        .map((x) => VOICE_BY_PERSONALITY[x])
        .find((v): v is BrandVoice => Boolean(v)) ?? "professional";
    return BrandKitSchema.parse({
      colors: {
        ink: p.foreground,
        canvas: p.background,
        primary: p.primary,
        primaryText: p.primaryForeground,
        accent: p.accent,
        accentText: p.accentForeground,
        muted: p.mutedForeground,
      },
      typography: {
        pairing: d.typography.pairing,
        displayFamily: pairing.display.family,
        bodyFamily: pairing.body.family,
      },
      shape: d.shape,
      voice: { tone: voice },
      imagery: { style: d.imagery.style, seed: d.imagery.seed },
    });
  }
  const b = spec.brand;
  const canvas = "#ffffff";
  const ink = "#16181d";
  const primaryText = ensureContrast("#ffffff", b.primaryColor);
  const accentText = ensureContrast("#16181d", b.accentColor);
  const tone: Record<string, BrandVoice> = {
    professional: "professional",
    friendly: "warm",
    premium: "premium",
    playful: "playful",
    minimal: "direct",
  };
  return BrandKitSchema.parse({
    colors: {
      ink,
      canvas,
      primary: b.primaryColor,
      primaryText,
      accent: b.accentColor,
      accentText,
      muted: ensureContrast("#5b616e", canvas),
    },
    typography: {
      pairing: `v1-${b.typography}`,
      displayFamily: b.typography === "classic" ? "Georgia" : "system-ui",
      bodyFamily: "system-ui",
    },
    shape:
      b.radius === "none" ? "sharp" : b.radius === "round" ? "rounded" : "soft",
    voice: { tone: tone[b.tone] ?? "professional" },
    imagery: { style: "minimal", seed: 1 },
  });
}

export interface BrandIssue {
  field: string;
  message: string;
}
/** Colour pairs that carry text in generated assets must stay readable; an owner override that breaks this is rejected. */
export function brandKitIssues(kit: BrandKit): BrandIssue[] {
  const pairs: Array<[string, string, string]> = [
    ["ink on canvas", kit.colors.ink, kit.colors.canvas],
    ["primaryText on primary", kit.colors.primaryText, kit.colors.primary],
    ["accentText on accent", kit.colors.accentText, kit.colors.accent],
    ["muted on canvas", kit.colors.muted, kit.colors.canvas],
  ];
  const out: BrandIssue[] = [];
  for (const [name, fg, bg] of pairs) {
    const c = contrast(fg, bg);
    if (c < 4.5)
      out.push({
        field: `colors.${name.split(" ")[0]}`,
        message: `${name} has contrast ${c.toFixed(2)}; at least 4.5 is needed so text stays readable`,
      });
  }
  return out;
}
