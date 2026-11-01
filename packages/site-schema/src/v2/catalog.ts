import type { Media } from "./spec.js";

/**
 * Kora's curated photograph catalogue.
 *
 * Bundled images live in @kora/site-media. Curated external images are served
 * directly from their licensed source CDN and retain source/licence metadata.
 * A photograph is only eligible for verticals it honestly represents.
 */
export interface CatalogEntry {
  id: string;
  file?: string;
  externalUrl?: string;
  alt: string;
  recipes: string[];
  tone: "light" | "dark" | "any";
  focal?: { x: number; y: number };
  creator: string;
  license: "Pexels License";
  licenseUrl: string;
  sourceUrl: string;
}
const L = "https://www.pexels.com/license/";
const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;

export const MEDIA_CATALOG: readonly CatalogEntry[] = [
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
    recipes: ["hotel", "hotel-shortlet", "events", "restaurant", "party-rentals"],
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

  // Barbershop / grooming — a visual vertical must have a real image set, not one stock hero.
  {
    id: "barber-black-client-cut",
    externalUrl: pexels(35157692),
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
    externalUrl: pexels(35157699),
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
    externalUrl: pexels(33418521),
    alt: "Professional barber working with a client inside a modern shop",
    recipes: ["barber"],
    tone: "light",
    focal: { x: 0.45, y: 0.45 },
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/33418521/",
  },

  // Cake / bakery — product, process and maker imagery form a coherent story.
  {
    id: "bakery-nigeria-maker",
    externalUrl: pexels(35367277),
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
    externalUrl: pexels(8478047),
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
    externalUrl: pexels(8477970),
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
    externalUrl: pexels(7875863),
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
    externalUrl: pexels(8152740),
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
    externalUrl: pexels(8112134),
    alt: "Legal documents and professional work at an office table",
    recipes: ["law", "accounting", "consulting"],
    tone: "dark",
    creator: "Pexels contributor",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl: "https://www.pexels.com/photo/8112134/",
  },
];

export const MEDIA_URL_PREFIX = "/_kora/media/";

function toMedia(entry: CatalogEntry): Media {
  return {
    url: entry.file ? `${MEDIA_URL_PREFIX}${entry.file}` : entry.externalUrl!,
    alt: entry.alt,
    width: 1600,
    height: 1067,
    ...(entry.focal ? { focalPoint: entry.focal } : {}),
    source: entry.file ? "bundled" : "external",
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

/** Backwards-compatible single-photo selector used by the deterministic planner. */
export function catalogMediaFor(
  recipeId: string,
  mode: "light" | "dark",
): Media | undefined {
  return catalogMediaSetFor(recipeId, mode, 1)[0];
}
