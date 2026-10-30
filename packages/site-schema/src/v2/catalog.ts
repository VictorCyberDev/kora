import type { Media } from "./spec.js";

/**
 * The curated photograph catalogue. Five images, all licensed for commercial reuse
 * (Pexels License), none showing another business's name. The files live in
 * @kora/site-media and every Kora host serves them at /_kora/media/<file>.
 */
export interface CatalogEntry {
  id: string;
  file: string;
  alt: string;
  /** Recipes this photograph honestly fits; a photo is never used for a business it does not represent. */
  recipes: string[];
  tone: "light" | "dark" | "any";
  /** Where the subject sits, so a crop never loses it. */
  focal?: { x: number; y: number };
  creator: string;
  license: "Pexels License";
  licenseUrl: string;
  sourceUrl: string;
}
const L = "https://www.pexels.com/license/";
export const MEDIA_CATALOG: readonly CatalogEntry[] = [
  {
    id: "restaurant-timber-ceiling",
    file: "restaurant-timber-ceiling.webp",
    alt: "A restaurant dining room under a sculpted timber ceiling with warm lighting",
    recipes: ["restaurant"],
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
    recipes: ["restaurant", "events"],
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
    recipes: ["cafe-bakery", "restaurant"],
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
    recipes: ["hotel", "events", "restaurant"],
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
    recipes: ["electronics-repair"],
    tone: "any",
    focal: { x: 0.3, y: 0.5 },
    creator: "Tima Miroshnichenko",
    license: "Pexels License",
    licenseUrl: L,
    sourceUrl:
      "https://www.pexels.com/photo/a-person-repairing-a-smartphone-6754839/",
  },
];

export const MEDIA_URL_PREFIX = "/_kora/media/";

/** The best honest photograph for a business type and colour mode, or undefined (then art or type carries the page). */
export function catalogMediaFor(
  recipeId: string,
  mode: "light" | "dark",
): Media | undefined {
  const fits = MEDIA_CATALOG.filter((e) => e.recipes.includes(recipeId));
  const pick =
    fits.find((e) => e.tone === mode) ??
    fits.find((e) => e.tone === "any") ??
    fits[0];
  if (!pick) return undefined;
  return {
    url: `${MEDIA_URL_PREFIX}${pick.file}`,
    alt: pick.alt,
    width: 1600,
    height: 1067,
    ...(pick.focal ? { focalPoint: pick.focal } : {}),
    source: "bundled",
    attribution: `Photo: ${pick.creator} / Pexels`,
    license: pick.license,
  };
}
