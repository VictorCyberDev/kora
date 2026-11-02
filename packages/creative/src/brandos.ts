/**
 * Brand OS: the versioned, owner-facing brand system every artifact consumes. It composes the strategy, the design
 * genome, the palette and rules for voice, media, channels and do/don't. A version is immutable: changing the brand
 * creates version N+1; artifacts record the version that made them and are never silently restyled.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { DesignGenomeSchema } from "./genome.js";
import { BrandStrategySchema } from "./strategy.js";
import { ImageBriefSchema } from "./artdirection.js";
import { CLICHES } from "./copy.js";
import { grammarById } from "./grammars.js";
import type { CreativeDirection } from "./directions.js";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BrandOSSchema = z.object({
  schema: z.literal("kora.brand-os/1").default("kora.brand-os/1"),
  version: z.number().int().min(1),
  name: z.string().max(100),
  directionId: z.string().max(80),
  grammarId: z.string().max(40),
  strategy: BrandStrategySchema,
  genome: DesignGenomeSchema,
  visual: z.object({
    colorwayId: z.string().max(40),
    mode: z.enum(["light", "dark"]),
    palette: z.object({ background: hex, foreground: hex, primary: hex, secondary: hex, accent: hex }),
    typeVoice: z.string().max(40),
    signatureMotif: z.string().max(40),
    shape: z.string().max(40),
    /** Uploaded logo asset id, or null. Kora never claims a generated mark is the owner's trademark. */
    logoAssetId: z.string().max(80).nullable().default(null),
    wordmark: z.object({ text: z.string().max(60), style: z.enum(["typographic", "monogram"]), replaceable: z.literal(true).default(true) }),
  }),
  voice: z.object({
    tone: z.string().max(60),
    headlineStyle: z.string().max(120),
    ctaLanguage: z.array(z.string().max(40)).max(6),
    use: z.array(z.string().max(40)).max(12).default([]),
    avoid: z.array(z.string().max(60)).max(60),
    language: z.string().max(20).default("en"),
  }),
  media: z.object({
    briefs: z.array(ImageBriefSchema).max(4),
    sourcePriority: z.array(z.string()).max(8),
  }),
  channels: z.object({
    website: z.string().max(160),
    social: z.string().max(160),
    story: z.string().max(160),
    flyer: z.string().max(160),
    whatsapp: z.string().max(160),
    banner: z.string().max(160),
  }),
  rules: z.object({ dos: z.array(z.string().max(160)).max(10), donts: z.array(z.string().max(160)).max(12) }),
  provenance: z.object({ createdBy: z.enum(["kora-deterministic", "owner-edit"]), seed: z.number().int().min(0) }),
});
export type BrandOS = z.infer<typeof BrandOSSchema>;

/** Stable content hash; artifacts store it next to the version number. */
export function brandOsHash(b: BrandOS): string {
  const stable = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : v && typeof v === "object"
        ? `{${Object.entries(v as Record<string, unknown>).sort(([a], [c]) => (a < c ? -1 : 1)).map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`).join(",")}}`
        : JSON.stringify(v) ?? "null";
  return createHash("sha256").update(stable(b)).digest("hex");
}

export function brandOsFromDirection(
  d: CreativeDirection,
  o: {
    name: string;
    palette: { background: string; foreground: string; primary: string; secondary: string; accent: string };
    mode: "light" | "dark";
    ctas: string[];
    previous?: BrandOS;
    logoAssetId?: string | null;
    use?: string[];
    avoid?: string[];
  },
): BrandOS {
  const g = grammarById(d.grammarId);
  const ch = d.genome;
  return BrandOSSchema.parse({
    version: (o.previous?.version ?? 0) + 1,
    name: o.name,
    directionId: d.id,
    grammarId: d.grammarId,
    strategy: d.strategy,
    genome: d.genome,
    visual: {
      colorwayId: d.colorwayId,
      mode: o.mode,
      palette: o.palette,
      typeVoice: ch.typeVoice,
      signatureMotif: ch.signatureMotif,
      shape: ch.radiusStyle,
      logoAssetId: o.logoAssetId ?? null,
      wordmark: { text: o.name, style: "typographic", replaceable: true },
    },
    voice: {
      tone: d.strategy.tone,
      headlineStyle: `${ch.headlineBehavior.replace(/-/g, " ")}; ${d.strategy.voice}`,
      ctaLanguage: o.ctas.slice(0, 6),
      use: o.use ?? [],
      avoid: [...new Set([...(o.avoid ?? []), ...CLICHES.filter((c) => !/[.{\\]/.test(c))])].slice(0, 60),
      language: "en",
    },
    media: { briefs: d.artDirection, sourcePriority: ["owner-supplied", "owner-approved-stored", "licensed-stock", "ai-generated", "procedural-illustration", "typography-only"] },
    channels: {
      website: d.compositionSummary,
      social: `${g?.campaignBehaviour ?? d.campaignBehaviour}`,
      story: `Full-height ${ch.paletteBehavior.replace(/-/g, " ")} composition; headline in the top safe area; action in the lower third.`,
      flyer: `Print-friendly: ${ch.typeVoice.replace(/-/g, " ")} type, ${ch.density} spacing, ${ch.signatureMotif === "none" ? "no motif" : ch.signatureMotif.replace(/-/g, " ")}.`,
      whatsapp: "Single message, large type, phone-readable at thumbnail size.",
      banner: "Wide: headline left, one action right, brand colour field.",
    },
    rules: {
      dos: [`Use the ${ch.signatureMotif === "none" ? "type system" : ch.signatureMotif.replace(/-/g, " ")} as the recurring device`, `Keep accent colour ${ch.accentScarcity}`, "Say only what the owner supplied"],
      donts: [...d.antiPatterns, "invent testimonials, prices, ratings, years or counts"],
    },
    provenance: { createdBy: o.previous ? "owner-edit" : "kora-deterministic", seed: d.seed },
  });
}
