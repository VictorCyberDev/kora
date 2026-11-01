/**
 * Art Direction (ADR-026). Decided before a SiteSpec is composed; a model or a person may author it,
 * but no model writes HTML or CSS. `artDirectionIssues` turns the Phase 0 audit measurements into gates.
 */
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SECTION_RHYTHM = ["dense", "open", "full-bleed", "quiet"] as const;
export const MOTION_BEHAVIOURS = [
  "none",
  "reveal-rise",
  "tile-reflow",
  "slow-pan",
  "stagger-grid",
] as const;
export const CATEGORIES = [
  "bakery-cakes",
  "restaurant",
  "caterer",
  "salon-beauty",
  "fashion",
  "events",
  "photography",
  "hospitality",
  "fitness",
  "general",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ArtDirectionSchema = z.object({
  version: z.literal(1).default(1),
  category: z.enum(CATEGORIES),
  /** One sentence: what this business should feel like to a stranger. */
  concept: z.string().trim().min(12).max(200),
  /** The distinctive repeatable device, e.g. "a displaced tile" or "a cake seen from above". */
  visualObject: z.string().trim().min(3).max(120),
  type: z.object({
    pairing: z.string().max(40),
    /** Headline width as a share of the viewport at desktop (0.04 = 4vw). The audit found 2.9–7.8%; the floor is 6%. */
    headlineVw: z.number().min(0.03).max(0.14),
  }),
  palette: z.object({
    ink: hex,
    canvas: hex,
    primary: hex,
    accent: hex,
    /** Which role carries the page when the photo is missing. */
    carrier: z.enum(["ink", "primary", "accent"]).default("primary"),
  }),
  /** Ordered sections with a rhythm tag; consecutive identical rhythms are rejected. */
  sections: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),
        rhythm: z.enum(SECTION_RHYTHM),
        /** Truth Engine key the section depends on; a section with no fact behind it is filler. */
        factKey: z.string().max(80).optional(),
        /** Number of real photos this section shows. */
        photos: z.number().int().min(0).max(12).default(0),
      }),
    )
    .min(3)
    .max(12),
  image: z.object({
    /** What each image must show. Never depicts premises, staff or products the owner has not stated. */
    brief: z.string().trim().min(10).max(300),
    provenance: z.enum(["owner-upload", "licensed", "generated"]),
    /** Generated food/product images must pass the dish/product gate. */
    gatePassed: z.boolean().default(false),
  }),
  motion: z.object({
    behaviour: z.enum(MOTION_BEHAVIOURS),
    /** Required whenever behaviour is not "none". */
    reducedMotion: z.string().max(120).optional(),
  }),
  /** At most this many deliberate irregularities (an offset, a rotated crop). */
  irregularityBudget: z.number().int().min(0).max(3).default(1),
  brandCodes: z.array(z.string().max(60)).max(5).default([]),
});
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

/** What a category must contain. Playbooks constrain direction; they are not templates. */
export const PLAYBOOKS: Record<
  string,
  { mustShow: string[]; banned: string[]; minPhotosFirstTwoScreens: number }
> = {
  "bakery-cakes": {
    mustShow: ["product", "price-or-enquiry", "how-to-order"],
    banned: ["how-it-works", "trust-strip-duplicate", "empty-room"],
    minPhotosFirstTwoScreens: 3,
  },
  restaurant: {
    mustShow: ["menu", "hours", "location"],
    banned: ["how-it-works", "empty-room"],
    minPhotosFirstTwoScreens: 3,
  },
  general: {
    mustShow: [],
    banned: ["how-it-works"],
    minPhotosFirstTwoScreens: 1,
  },
};

export type ArtIssue = { code: string; message: string };

const PHOTO_CATEGORIES = new Set<string>([
  "bakery-cakes",
  "restaurant",
  "caterer",
]);

export function artDirectionIssues(a: ArtDirection): ArtIssue[] {
  const issues: ArtIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const play = PLAYBOOKS[a.category] ?? PLAYBOOKS["general"]!;

  if (a.type.headlineVw < 0.06)
    add(
      "HEADLINE_TOO_SMALL",
      `Headline is ${(a.type.headlineVw * 100).toFixed(1)}% of width; the floor is 6%.`,
    );

  for (let i = 1; i < a.sections.length; i++)
    if (a.sections[i]!.rhythm === a.sections[i - 1]!.rhythm)
      add(
        "FLAT_RHYTHM",
        `Sections "${a.sections[i - 1]!.id}" and "${a.sections[i]!.id}" repeat the same rhythm.`,
      );

  for (const s of a.sections)
    if (!s.factKey && s.photos === 0)
      add(
        "FILLER_SECTION",
        `Section "${s.id}" has no fact and no photo behind it.`,
      );
  for (const s of a.sections)
    if (play.banned.includes(s.id))
      add("BANNED_SECTION", `Section "${s.id}" is banned for ${a.category}.`);

  const firstTwo = a.sections.slice(0, 2).reduce((n, s) => n + s.photos, 0);
  if (
    PHOTO_CATEGORIES.has(a.category) &&
    firstTwo < play.minPhotosFirstTwoScreens
  )
    add(
      "TOO_FEW_PHOTOS",
      `Only ${firstTwo} photo(s) in the first two sections; ${a.category} needs ${play.minPhotosFirstTwoScreens}.`,
    );

  const ids = new Set(a.sections.map((s) => s.id));
  for (const need of play.mustShow)
    if (!ids.has(need))
      add("MISSING_REQUIRED", `${a.category} must include "${need}".`);

  if (a.image.provenance === "generated" && !a.image.gatePassed)
    add(
      "UNGATED_GENERATED_IMAGE",
      "Generated imagery has not passed the dish/product gate.",
    );

  if (a.motion.behaviour !== "none" && !a.motion.reducedMotion)
    add("NO_REDUCED_MOTION", "Motion needs a reduced-motion fallback.");

  if (a.brandCodes.length > 0 && a.irregularityBudget === 0)
    add(
      "CODE_WITHOUT_IRREGULARITY",
      "Brand codes need an irregularity budget of at least 1.",
    );
  return issues;
}
