/**
 * Rate-aware Unsplash selection for customer-requested website designs.
 * We use only official hotlinked photo.urls properties. Never proxy or
 * download raw image bytes, never expose the access key, and never send a
 * customer private description or business name to the provider.
 *
 * Photos selected for a published design must be counted through the
 * provider's download_location endpoint. Failed tracking means no photo.
 */
import { z } from "zod";
import type { MediaV3 } from "@kora/site-schema";
const photoSchema = z.object({
  id: z.string().min(4).max(80),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt_description: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  urls: z.object({ regular: z.string().url(), small: z.string().url() }),
  user: z.object({
    name: z.string().min(1).max(100),
    links: z.object({ html: z.string().url() }),
  }),
  links: z.object({
    html: z.string().url(),
    download_location: z.string().url(),
  }),
});
const searchSchema = z.object({ results: z.array(photoSchema).max(30) });
type Photo = z.infer<typeof photoSchema>;
export interface StockPhoto {
  id: string;
  media: MediaV3;
  downloadLocation: string;
}
const intents: Record<string, string[]> = {
  bakery: [
    "artisan sourdough bread pastry",
    "bakery freshly baked croissant",
    "celebration cake pastry",
  ],
  cafe: ["specialty coffee latte art", "modern cafe interior"],
  restaurant: ["restaurant plated seasonal food", "restaurant dining interior"],
  fashion: ["fashion clothing editorial", "atelier tailoring fabric detail"],
  beauty: ["beauty salon treatment interior", "hair styling beauty studio"],
  law: ["legal office documents desk", "legal library architecture"],
  hotel: ["boutique hotel guest room", "hotel lobby interior"],
  realestate: [
    "modern residential architecture exterior",
    "house interior living room",
  ],
  creative: [
    "creative studio design workspace",
    "graphic design materials print",
  ],
  photography: [
    "photography camera portrait studio",
    "photographer camera lighting",
  ],
  technology: ["software developer workstation", "technology server equipment"],
  fitness: ["fitness exercise training studio", "gym weight equipment"],
  architecture: [
    "architecture modern building exterior",
    "architect drawing plans",
  ],
  repair: [
    "laptop repair electronics workbench",
    "computer technician repair tools",
  ],
  education: ["classroom books learning materials", "students study workspace"],
  travel: ["travel landscapes mountains coast", "travel map compass"],
  nonprofit: ["community volunteer work", "community workshop people"],
};
const cache = new Map<string, { expires: number; photos: StockPhoto[] }>();
let remaining = 50,
  pauseUntil = 0;
const MAX_PER_BUILD = 3,
  MIN_REMAINING = 4;
const valid = (uri: string, host: string) => {
  try {
    return new URL(uri).hostname === host;
  } catch {
    return false;
  }
};
const credit = (p: Photo) =>
  `Photo by ${p.user.name} on Unsplash`.slice(0, 200);
export async function findUnsplashStock(
  industry: string,
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<StockPhoto[]> {
  if (!key || Date.now() < pauseUntil) return [];
  const labels = intents[industry.toLowerCase()] ?? [];
  if (!labels.length) return [];
  const found: StockPhoto[] = [];
  for (const query of labels.slice(0, MAX_PER_BUILD)) {
    const cached = cache.get(query);
    if (cached && cached.expires > Date.now()) {
      found.push(...cached.photos);
      continue;
    }
    if (remaining <= MIN_REMAINING) break;
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "7");
    url.searchParams.set("orientation", "landscape");
    url.searchParams.set("content_filter", "high");
    try {
      const response = await fetcher(url, {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
        signal: AbortSignal.timeout(4000),
      });
      const left = response.headers.get("x-ratelimit-remaining");
      if (left !== null && Number.isFinite(Number(left)))
        remaining = Number(left);
      else remaining = Math.max(0, remaining - 1);
      if (response.status === 429) {
        pauseUntil = Date.now() + 3600000;
        break;
      }
      if (!response.ok) continue;
      const parsed = searchSchema.safeParse(await response.json());
      if (!parsed.success) continue;
      const photos = parsed.data.results
        .filter(
          (p) =>
            p.width >= 900 &&
            p.height >= 600 &&
            valid(p.urls.regular, "images.unsplash.com") &&
            valid(p.urls.small, "images.unsplash.com") &&
            valid(p.links.download_location, "api.unsplash.com") &&
            valid(p.user.links.html, "unsplash.com") &&
            valid(p.links.html, "unsplash.com"),
        )
        .slice(0, 4)
        .map((p): StockPhoto => ({
          id: p.id,
          downloadLocation: p.links.download_location,
          media: {
            url: p.urls.regular,
            alt: (p.alt_description || p.description || query).slice(0, 200),
            width: p.width,
            height: p.height,
            srcset: [
              { url: p.urls.small, width: 400 },
              { url: p.urls.regular, width: 1080 },
            ],
            role: "feature",
            treatment: "none",
            provenance: {
              sourceType: "licensed-stock",
              provider: "Unsplash",
              license: "Unsplash License",
              reviewStatus: "unreviewed",
              attribution: credit(p),
              photographer: p.user.name,
              photographerUrl: p.user.links.html,
              sourceUrl: p.links.html,
            },
          },
        }));
      if (cache.size >= 60) cache.delete(cache.keys().next().value!);
      cache.set(query, { expires: Date.now() + 3600000, photos });
      found.push(...photos);
    } catch {
      // This provider is optional. Kora's bundled licensed catalog remains available.
    }
  }
  return [...new Map(found.map((photo) => [photo.id, photo])).values()].slice(
    0,
    8,
  );
}
export async function trackUnsplashSelection(
  selected: StockPhoto[],
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!selected.length) return true;
  if (!key) return false;
  for (const photo of selected) {
    if (!valid(photo.downloadLocation, "api.unsplash.com")) return false;
    try {
      const response = await fetcher(photo.downloadLocation, {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) return false;
    } catch {
      return false;
    }
  }
  return true;
}
