import type { Media } from "./spec.js";
import { EXTRA_CATALOG } from "./catalog-extra.js";

/**
 * Kora's curated photograph catalogue.
 *
 * Every production image is bundled in @kora/site-media and served from Kora's
 * own origin. Source and licence metadata are retained for provenance, but a
 * published customer site never depends on a third-party image request.
 */
export interface CatalogEntry {
  id: string;
  file: string;
  /** Kept optional for backwards-compatible catalogue consumers; runtime media is bundled. */
  externalUrl?: string;
  alt: string;
  recipes: string[];
  /**
   * Offering topics this picture honestly depicts (blueprint topic ids, e.g. "cakes"). A topic page only shows pictures
   * tagged for it; an untagged picture is general and may appear on general pages, never as proof of a specific offering.
   */
  topics?: string[];
  tone: "light" | "dark" | "any";
  focal?: { x: number; y: number };
  creator: string;
  license: "Pexels License";
  licenseUrl: string;
  sourceUrl: string;
}
const L = "https://www.pexels.com/license/";

const CORE_CATALOG: readonly CatalogEntry[] = [
  {
    id: "restaurant-timber-ceiling",
    file: "restaurant-timber-ceiling.webp",
    alt: "A restaurant dining room under a sculpted timber ceiling with warm lighting",
    recipes: ["restaurant", "bukka"],
    tone: "dark",
    creator: "Lens Clickk",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/modern-restaurant-interior-with-wooden-ceiling-design-30479386/",
  },
  {
    id: "restaurant-bright-chic",
    file: "restaurant-bright-chic.webp",
    alt: "A bright restaurant with cream banquette seating and set tables",
    recipes: ["restaurant", "events", "bukka", "catering"],
    tone: "light",
    creator: "Misbaa Eri",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/modern-chic-interior-of-upscale-restaurant-37532766/",
  },
  {
    id: "cafe-minimal-daylight",
    file: "cafe-minimal-daylight.webp",
    alt: "A minimal café with wooden tables and benches in soft daylight",
    recipes: ["cafe-bakery", "cake-business", "restaurant"],
    tone: "light",
    creator: "Orlova Maria",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/wooden-furniture-in-cozy-minimalist-cafeteria-4940753/",
  },
  {
    id: "hospitality-sunlit-hall",
    file: "hospitality-sunlit-hall.webp",
    alt: "A sunlit hall with timber beams, large windows and laid tables",
    recipes: [
      "hotel",
      "hotel-shortlet",
      "events",
      "restaurant",
      "party-rentals",
    ],
    tone: "any",
    creator: "Bertelli Fotografia",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/sunlit-hall-with-windows-13871340/",
  },
  {
    id: "repair-bench-microscope",
    file: "repair-bench-microscope.webp",
    alt: "A technician repairing a smartphone under a microscope at a workbench",
    recipes: ["electronics-repair", "phone-accessories"],
    tone: "any",
    focal: { x: 0.3, y: 0.5 },
    creator: "Tima Miroshnichenko",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/a-person-repairing-a-smartphone-6754839/",
  },

  // Barbershop / grooming — a visual vertical gets a real image set, not one stock hero.
  {
    id: "barber-black-client-cut",
    file: "barber-black-client-cut.webp",
    alt: "A Black client receiving a precision haircut in a contemporary barbershop",
    recipes: ["barber"],
    tone: "dark",
    focal: { x: 0.52, y: 0.42 },
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/black-man-getting-a-haircut-by-a-barber-35157692/",
  },
  {
    id: "barber-detail-grooming",
    file: "barber-detail-grooming.webp",
    alt: "Close-up professional barbering and grooming service",
    recipes: ["barber"],
    tone: "any",
    focal: { x: 0.5, y: 0.44 },
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/35157699/",
  },
  {
    id: "barber-shop-service",
    file: "barber-shop-service.webp",
    alt: "Professional barber working with a client inside a modern shop",
    recipes: ["barber"],
    tone: "light",
    focal: { x: 0.45, y: 0.45 },
    creator: "Tosin Olowoleni",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/barber-giving-haircut-in-traditional-shop-33418521/",
  },

  // Cake / bakery — product, process and maker imagery form a coherent story.
  {
    id: "bakery-nigeria-maker",
    topics: ["cakes"],
    file: "bakery-nigeria-maker.webp",
    alt: "A baker working in a contemporary Nigerian kitchen",
    recipes: ["cafe-bakery", "cake-business", "catering"],
    tone: "any",
    focal: { x: 0.5, y: 0.42 },
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/35367277/",
  },
  {
    id: "bakery-cake-making",
    topics: ["cakes"],
    file: "bakery-cake-making.webp",
    alt: "A baker carefully preparing a celebration cake",
    recipes: ["cafe-bakery", "cake-business"],
    tone: "light",
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/woman-making-a-cake-8478047/",
  },
  {
    id: "bakery-cake-frosting",
    topics: ["cakes"],
    file: "bakery-cake-frosting.webp",
    alt: "A baker frosting and finishing a cake by hand",
    recipes: ["cafe-bakery", "cake-business"],
    tone: "light",
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/woman-frosting-a-cake-8477970/",
  },

  // Legal / professional services — environment and working detail, never fabricated client proof.
  {
    id: "lawyer-office-work",
    file: "lawyer-office-work.webp",
    alt: "A corporate attorney reviewing documents at an office desk",
    recipes: ["law"],
    tone: "any",
    focal: { x: 0.45, y: 0.42 },
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/corporate-attorney-working-in-office-7875863/",
  },
  {
    id: "law-office-consultation",
    file: "law-office-consultation.webp",
    alt: "Professionals discussing documents during an office consultation",
    recipes: ["law", "accounting", "consulting"],
    tone: "light",
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/8152740/",
  },
  {
    id: "law-documents-detail",
    file: "law-documents-detail.webp",
    alt: "Legal documents and professional work at an office table",
    recipes: ["law", "accounting", "consulting"],
    tone: "dark",
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/8112134/",
  },
];

/** Core photographs plus the vetted additions (see catalog-extra.ts and packages/site-media/catalog-source). */
export const MEDIA_CATALOG: readonly CatalogEntry[] = [
  ...CORE_CATALOG,
  ...EXTRA_CATALOG,
];

export const MEDIA_URL_PREFIX = "/_kora/media/";

function toMedia(entry: CatalogEntry): Media {
  return {
    url: `${MEDIA_URL_PREFIX}${entry.file}`,
    alt: entry.alt,
    width: 1600,
    height: 1067,
    ...(entry.focal ? { focalPoint: entry.focal } : {}),
    source: "bundled",
    attribution: `Photo: ${entry.creator} / Pexels`,
    license: entry.license,
  };
}

/**
 * A coherent visual set for a vertical. Tone-matching images are preferred but
 * never at the expense of honesty. The caller can spread the set across hero,
 * about and service cards so image-led businesses never ship with a lone photo.
 */
export function catalogMediaSetFor(
  recipeId: string,
  mode: "light" | "dark" = "light",
  limit = 4,
): Media[] {
  const fits = MEDIA_CATALOG.filter((e) => e.recipes.includes(recipeId));
  const ranked = [...fits].sort((a, b) => {
    const score = (entry: CatalogEntry) =>
      entry.tone === mode ? 2 : entry.tone === "any" ? 1 : 0;
    return score(b) - score(a);
  });
  return ranked.slice(0, Math.max(1, limit)).map(toMedia);
}

/** The topics a bundled picture depicts, or undefined when it is general or not from the catalogue. */
export function catalogTopicsForUrl(
  url: string,
): readonly string[] | undefined {
  return MEDIA_CATALOG.find((e) => `${MEDIA_URL_PREFIX}${e.file}` === url)
    ?.topics;
}

/**
 * A coherent pool of pictures for one business: pictures made for its trade (recipe) plus pictures tagged for the specific
 * offerings the owner confirmed (topic), so a bakery that bakes cakes and small chops draws both. Interleaved by topic so the
 * first few (hero, then offers) cover different subjects instead of five cakes in a row.
 */
export function catalogMediaPool(
  recipeId: string | undefined,
  topicIds: readonly string[],
  mode: "light" | "dark",
  limit = 18,
): Media[] {
  const fits = MEDIA_CATALOG.filter(
    (e) =>
      (recipeId && e.recipes.includes(recipeId)) ||
      e.topics?.some((t) => topicIds.includes(t)),
  );
  const toneScore = (e: CatalogEntry) =>
    e.tone === mode ? 2 : e.tone === "any" ? 1 : 0;
  const groups = new Map<string, CatalogEntry[]>();
  for (const e of fits) {
    const key =
      topicIds.find((t) => e.topics?.includes(t)) ?? e.topics?.[0] ?? "general";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const order = [
    ...topicIds,
    ...[...groups.keys()].filter((k) => !topicIds.includes(k)),
  ].filter((k) => groups.has(k));
  for (const k of order)
    groups.get(k)!.sort((a, b) => toneScore(b) - toneScore(a));
  const out: CatalogEntry[] = [];
  for (let i = 0; out.length < Math.min(limit, fits.length); i++) {
    let added = false;
    for (const k of order) {
      const e = groups.get(k)![i];
      if (e && !out.includes(e)) {
        out.push(e);
        added = true;
      }
    }
    if (!added) break;
  }
  return out.slice(0, limit).map(toMedia);
}

/** Backwards-compatible single-photo selector used by the deterministic planner. */
export function catalogMediaFor(
  recipeId: string,
  mode: "light" | "dark",
): Media | undefined {
  return catalogMediaSetFor(recipeId, mode, 1)[0];
}
