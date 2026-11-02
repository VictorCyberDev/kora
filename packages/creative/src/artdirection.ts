/**
 * Art Direction as structured data (extends ADR-026). An image request is never just "cake": it states subject,
 * context, camera, light, surface, human presence, colour relationship, negative space, crop, emotion and placement.
 * The renderer, a stock picker or an image model can all consume the same brief; none of them is trusted to decide it.
 */
import { z } from "zod";
import type { Grammar } from "./grammars.js";
import type { VerticalIntel } from "./verticals.js";

export const PLACEMENTS = [
  "hero",
  "feature",
  "gallery",
  "about",
  "campaign",
  "social-preview",
] as const;
export const MEDIA_SOURCES = [
  "owner-supplied",
  "owner-approved-stored",
  "licensed-stock",
  "ai-generated",
  "procedural-illustration",
  "typography-only",
] as const;
export type MediaSourceType = (typeof MEDIA_SOURCES)[number];

export const ImageBriefSchema = z.object({
  subject: z.string().max(160),
  context: z.string().max(160),
  cameraDistance: z.enum(["macro", "close", "medium", "wide", "aerial"]),
  cameraAngle: z.enum([
    "eye-level",
    "overhead",
    "low",
    "three-quarter",
    "straight-on",
  ]),
  lighting: z.string().max(120),
  background: z.string().max(120),
  texture: z.string().max(100),
  humanPresence: z.enum(["none", "hands-only", "partial", "person"]),
  colourRelationship: z.string().max(140),
  negativeSpace: z.enum(["none", "left", "right", "top", "bottom", "generous"]),
  cropStrategy: z.enum(["natural", "tall", "square", "wide", "arch"]),
  emotion: z.string().max(80),
  brandRelationship: z.string().max(160),
  placement: z.enum(PLACEMENTS),
  /** Which source to try first; see MEDIA_PRIORITY. */
  preferredSource: z.enum(MEDIA_SOURCES),
  /** Hard rules: what this image must not depict or imply. */
  mustNot: z.array(z.string().max(100)).max(8),
});
export type ImageBrief = z.infer<typeof ImageBriefSchema>;

/** Source priority from the mandate: real assets first, honest typography last. */
export const MEDIA_PRIORITY: readonly MediaSourceType[] = MEDIA_SOURCES;

export const TRUTH_MUST_NOTS = [
  "fake customers, staff or testimonials presented as real",
  "a storefront, office, room or finished project that is not the owner's, presented as theirs",
  "awards, certifications or ratings",
  "readable text, logos or prices",
] as const;

const LIGHT: Record<string, string> = {
  warm: "warm indirect daylight",
  dark: "low-key directional light with deep shadows",
  bright: "clean bright daylight, soft shadows",
  calm: "soft diffused window light",
};

export interface ArtDirectionInput {
  vertical: VerticalIntel;
  grammar: Grammar;
  /** The owner's own words for what they offer. */
  thing: string;
  palette: {
    bg: string;
    primary: string;
    accent: string;
    mode: "light" | "dark";
  };
  hasOwnerPhotos: boolean;
  placement: (typeof PLACEMENTS)[number];
}

const SUBJECT_BY_CLUSTER: Record<string, string> = {
  food: "the finished food, close and appetising",
  beauty: "finished work in detail",
  trades: "tools and a tidy finished job",
  professional: "quiet interior detail and documents, no faces",
  health: "calm treatment-room detail and clean equipment",
  creative: "a representative piece of the work",
  hospitality: "the space in good light",
  retail: "the product alone on a simple surface",
  education: "friendly simple illustration of learning",
  civic: "a warm gathering space",
  tech: "an abstract diagram of the system, no interfaces",
  agri: "fresh produce and packaging",
  mobility: "the vehicle and a loaded cargo detail",
};

export function artDirect(i: ArtDirectionInput): ImageBrief {
  const g = i.grammar.genome;
  const tone =
    g.paletteBehavior === "dark-field" || i.palette.mode === "dark"
      ? "dark"
      : g.density === "airy"
        ? "calm"
        : g.accentScarcity === "frequent"
          ? "bright"
          : "warm";
  const real = i.hasOwnerPhotos;
  const photoLed = i.vertical.photoTrust;
  const preferred: MediaSourceType = real
    ? "owner-supplied"
    : photoLed && i.vertical.catalogRecipe
      ? "licensed-stock"
      : g.imageDominance === "none" || !photoLed
        ? "procedural-illustration"
        : "typography-only";
  const subject = `${SUBJECT_BY_CLUSTER[i.vertical.cluster] ?? "the work"} (${i.thing})`;
  const crop = g.imageCrop;
  return ImageBriefSchema.parse({
    subject,
    context: i.vertical.imagery[0] ?? "the place of work",
    cameraDistance: g.density === "airy" ? "close" : "medium",
    cameraAngle: i.vertical.cluster === "food" ? "overhead" : "eye-level",
    lighting: LIGHT[tone],
    background:
      i.palette.mode === "dark"
        ? "deep, low-detail dark surface"
        : "restrained surface in the brand's neutral",
    texture: i.grammar.tags.includes("craft")
      ? "visible handmade texture"
      : "clean, minimal texture",
    humanPresence:
      i.vertical.cluster === "food" || i.vertical.cluster === "creative"
        ? "hands-only"
        : "none",
    colourRelationship: `harmonises with ${i.palette.primary} and ${i.palette.accent} on ${i.palette.bg}`,
    negativeSpace: g.alignment === "center" ? "generous" : "left",
    cropStrategy: crop,
    emotion: i.grammar.emotionalGoal,
    brandRelationship: `${i.grammar.name}: ${i.grammar.visualTension}`,
    placement: i.placement,
    preferredSource: preferred,
    mustNot: [...TRUTH_MUST_NOTS],
  });
}

/** One paragraph a human or an image model can use; deterministic from the structured brief. */
export function briefToPrompt(b: ImageBrief): string {
  const parts = [
    `${b.cameraDistance === "macro" ? "Extreme close-up" : b.cameraDistance === "close" ? "Close-up" : b.cameraDistance === "medium" ? "Medium shot" : b.cameraDistance === "wide" ? "Wide shot" : "Aerial view"} of ${b.subject}`,
    `${b.cameraAngle} angle`,
    b.context,
    b.lighting,
    b.background,
    b.texture,
    b.humanPresence === "none"
      ? "no people"
      : `${b.humanPresence.replace("-", " ")} only`,
    b.negativeSpace === "none"
      ? ""
      : `${b.negativeSpace} negative space for text`,
    b.colourRelationship,
    `feeling of ${b.emotion}`,
    `${b.cropStrategy} crop`,
    "no text, no logos, no people's faces",
  ];
  return `${parts.filter(Boolean).join(", ")}.`;
}
