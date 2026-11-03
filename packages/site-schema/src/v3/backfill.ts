import {
  brandOsFromDirection,
  composeDirections,
  grammarById,
  hexToRgb,
  mix,
  type BrandOS,
  type CreativeBrief,
  type CreativeDirection,
} from "@kora/creative";
import { designBriefSchema } from "../v2/plan.js";
import type { SiteSpec } from "../spec.js";
import type { SiteSpecV2 } from "../v2/spec.js";

type Old = SiteSpec | SiteSpecV2;

/** The facts an older website already states, as a brief. Nothing is added that the site did not say. */
export function briefFromOldSpec(
  old: Old,
  extra: { feel?: string; goal?: CreativeBrief["goal"] } = {},
): CreativeBrief {
  const b = old.business;
  const services: string[] = [];
  for (const p of old.pages)
    for (const sec of p.sections)
      if (sec.type === "services" && "items" in sec)
        for (const it of sec.items) {
          const t = "title" in it ? it.title : "";
          if (t && !services.includes(t)) services.push(t);
        }
  return designBriefSchema.parse({
    name: b.name,
    description:
      b.description && b.description.length >= 12
        ? b.description
        : `${b.name} — ${old.seo.description || b.name}`.slice(0, 600),
    ...(extra.goal ? { goal: extra.goal } : {}),
    ...(extra.feel ? { feel: extra.feel } : {}),
    ...(b.industry ? { industry: b.industry } : {}),
    ...(b.location ? { location: b.location } : {}),
    ...(b.phone ? { phone: b.phone } : {}),
    ...(b.whatsapp ? { whatsapp: b.whatsapp } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(services.length ? { services: services.slice(0, 12) } : {}),
    ...("hours" in b && Array.isArray(b.hours) && b.hours.length
      ? { hours: b.hours }
      : {}),
  }) as CreativeBrief;
}

const dist = (a: string, b: string) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** The colours an older site actually shows, mapped onto the five Brand OS roles. */
function oldPalette(old: Old) {
  if (old.version === 2) {
    const p = old.design.palette;
    return {
      palette: {
        background: p.background,
        foreground: p.foreground,
        primary: p.primary,
        secondary: p.secondary,
        accent: p.accent,
      },
      mode: old.design.mode,
    };
  }
  const bg = "#ffffff";
  return {
    palette: {
      background: bg,
      foreground: "#111827",
      primary: old.brand.primaryColor,
      secondary: mix(old.brand.primaryColor, bg, 0.82),
      accent: old.brand.accentColor,
    },
    mode: "light" as const,
  };
}

const VOICE_OF_V2: Record<string, string> = {
  "editorial-serif": "modern-serif",
  "luxury-serif": "editorial-luxury",
  "modern-grotesk": "minimal-modernist",
  humanist: "friendly-humanist",
  geometric: "technical-grotesk",
  "soft-rounded": "rounded-playful",
  technical: "technical-grotesk",
  "high-contrast-serif": "high-fashion",
  "warm-serif": "craft-warm",
  expressive: "display-statement",
  "creative-display": "quirky-grotesk",
};
const VOICE_OF_V1: Record<string, string> = {
  modern: "minimal-modernist",
  classic: "heritage-serif",
  friendly: "friendly-humanist",
};

export interface BackfilledBrandOs {
  brandOs: BrandOS;
  /** The direction whose strategy best matches the site's colours; used only for the words around the brand. */
  direction: CreativeDirection;
}

/**
 * Works out the Brand OS an existing v1/v2 website already embodies, so an owner who never saw one can see what Kora
 * knows, and so the new engine can start from it. Colours and type are READ from the site. Strategy and voice come
 * from the facts on the site; the record says it is inferred and lists what could not be known. It is a description,
 * never a rewrite: nothing is republished and the old version is untouched.
 */
export function inferBrandOs(
  old: Old,
  o: { versionId?: string; version?: number } = {},
): BackfilledBrandOs {
  const brief = briefFromOldSpec(old);
  const dirs = composeDirections(brief);
  const { palette, mode } = oldPalette(old);
  // the direction whose own primary colour is closest to the site's: the least misleading label for what exists
  const primaryOf = (d: CreativeDirection) =>
    grammarById(d.grammarId)?.colorways.find((c) => c.id === d.colorwayId)
      ?.primary ?? palette.primary;
  const best = [...dirs].sort(
    (a, b) =>
      dist(primaryOf(a), palette.primary) - dist(primaryOf(b), palette.primary),
  )[0]!;
  const typeVoice =
    old.version === 2
      ? (VOICE_OF_V2[old.design.typography.pairing] ?? best.genome.typeVoice)
      : (VOICE_OF_V1[old.brand.typography] ?? best.genome.typeVoice);
  const chosen: CreativeDirection = {
    ...best,
    genome: { ...best.genome, typeVoice: typeVoice as never },
  };
  const bos = brandOsFromDirection(chosen, {
    name: old.business.name,
    palette,
    mode,
    ctas: [],
  });
  const brandOs: BrandOS = {
    ...bos,
    version: o.version ?? 1,
    provenance: {
      createdBy: "inferred-from-site",
      seed: bos.provenance.seed,
      inferred: {
        fromSpecVersion: old.version,
        ...(o.versionId ? { fromVersionId: o.versionId } : {}),
        unknown: [
          "whether the colours and type were chosen on purpose",
          "your logo",
          "what you would never say",
        ],
      },
    },
  };
  return { brandOs, direction: chosen };
}
