import {
  designBriefSchema,
  extractServicesV2,
  fnv,
  GOALS,
  lookFromFeel,
  planSite as basePlanSite,
  recipeFor,
  type DesignBrief,
  type DirectionPreview,
  type PlanOptions,
} from "./plan.js";
import { catalogMediaSetFor } from "./catalog.js";
import {
  referenceProfileFor,
  resolveAtlasVertical,
  type ReferenceProfile,
} from "./reference-atlas.js";
import { parseSiteSpecV2, type SiteSpecV2 } from "./spec.js";

export {
  designBriefSchema,
  extractServicesV2,
  fnv,
  GOALS,
  lookFromFeel,
  recipeFor,
};
export type { DesignBrief, DirectionPreview, PlanOptions };

const DIRECTION_COPY = [
  {
    name: "Story-led",
    summary:
      "An editorial direction that builds recognition through distinctive imagery, pacing and brand character.",
  },
  {
    name: "Proof-led",
    summary:
      "A trust-first direction that makes the offer, credibility and decision path immediately clear.",
  },
  {
    name: "Conversion-led",
    summary:
      "A decisive direction that puts the next customer action within thumb reach on every screen.",
  },
] as const;

/**
 * Owners describe businesses in local language. Normalize high-confidence wording
 * before retrieval without rewriting the owner's copy that is rendered on-page.
 */
function normalizeReferenceQuery(value: string): string {
  return value
    .replace(/\bbarbing\s+salon\b/gi, "barbershop barber")
    .replace(/\bbarbing\b/gi, "barber grooming")
    .replace(/\bbukka\b/gi, "bukka local food restaurant")
    .replace(/\bpos\s+(?:shop|stand|point|agent)\b/gi, "POS agent agency banking")
    .replace(/\bshort\s*let\b/gi, "shortlet hotel apartment")
    .replace(/\bchemist\b/gi, "pharmacy chemist")
    .replace(/\bprovisions?\b/gi, "grocery provisions minimart");
}

function briefQuery(brief: DesignBrief): string {
  return normalizeReferenceQuery(
    [
      brief.industry,
      brief.name,
      brief.description,
      ...(brief.services ?? []),
      brief.location,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function mediaSetFor(spec: SiteSpecV2, profile: ReferenceProfile) {
  const mode = spec.design.mode;
  const exact = catalogMediaSetFor(profile.vertical.id, mode, 5);
  if (exact.length >= 3) return exact;
  const recipe = catalogMediaSetFor(spec.meta.recipe, mode, 5);
  const seen = new Set(exact.map((m) => m.url));
  return [...exact, ...recipe.filter((m) => !seen.has(m.url))].slice(0, 5);
}

/**
 * Spread a coherent image set across the page instead of treating photography as
 * one ornamental hero asset. We never create testimonials, staff or customer
 * claims from reference imagery; images only illustrate the vertical honestly.
 */
function applyMediaStory(spec: SiteSpecV2, profile: ReferenceProfile): SiteSpecV2 {
  const media = mediaSetFor(spec, profile);
  if (!media.length) return spec;

  const pages = spec.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      if (section.type === "hero")
        return { ...section, media: media[0] ?? section.media };

      if (section.type === "services" && media.length >= 3) {
        return {
          ...section,
          variant: "image-cards" as const,
          items: section.items.map((item, index) => ({
            ...item,
            ...(index < Math.min(4, media.length - 1)
              ? { media: media[index + 1] ?? media[1] }
              : {}),
          })),
        };
      }

      if (section.type === "about" && media.length >= 2)
        return {
          ...section,
          variant: "image-text" as const,
          media: media[Math.min(media.length - 1, 2)] ?? media[1],
        };

      return section;
    }),
  }));

  return parseSiteSpecV2({
    ...spec,
    design: {
      ...spec.design,
      imagery: { ...spec.design.imagery, style: "photo-led" },
    },
    pages,
  });
}

/**
 * Atlas-aware deterministic planner. Existing callers keep the same contract,
 * while the brief now retrieves a vertical-specific reference profile before the
 * base planner composes the final original site.
 */
export function planSite(
  rawBrief: DesignBrief,
  opts: PlanOptions = {},
): SiteSpecV2 {
  const brief = designBriefSchema.parse(rawBrief);
  const direction = opts.direction ?? 0;
  const query = briefQuery(brief);
  const seed = fnv(`${brief.name}|${brief.description}|${brief.industry ?? ""}`);
  const profile = referenceProfileFor(query, direction, seed);
  const spec = basePlanSite(brief, {
    ...opts,
    lookId: opts.lookId ?? profile.lookId,
    paletteStrategy: opts.paletteStrategy ?? profile.paletteStrategy,
  });
  return applyMediaStory(spec, profile);
}

/** Three distinct Atlas-retrieved directions, compatible with the existing API. */
export function planDirections(brief: DesignBrief): DirectionPreview[] {
  const parsed = designBriefSchema.parse(brief);
  const query = briefQuery(parsed);
  const vertical = resolveAtlasVertical(query);
  return ([0, 1, 2] as const).map((index) => {
    const seed = fnv(`${parsed.name}|${parsed.description}|${parsed.industry ?? ""}`);
    const profile = referenceProfileFor(query, index, seed);
    const spec = planSite(parsed, { direction: index });
    const copy = DIRECTION_COPY[index];
    return {
      index,
      name: `${copy.name} ${vertical.label}`,
      summary: copy.summary,
      recipe: spec.meta.recipe,
      look: profile.lookId,
      palette: spec.design.paletteStrategy,
      spec,
    };
  });
}
