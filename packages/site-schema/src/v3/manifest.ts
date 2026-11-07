/**
 * Image manifest: one record per picture placement on a site, with where it came from, what rights it carries and where
 * it sits. It is derived from the spec (the single source of truth) so it cannot drift from what is published, and it
 * can be compared between versions to show which pictures were replaced.
 */
import type { SiteSpecV3 } from "./spec.js";

export type ManifestRights =
  | "owner-supplied"
  | "kora-licensed"
  | "provider-licence"
  | "generated"
  | "unknown";

export interface ManifestEntry {
  /** Stable within one spec: page, section index and item. */
  placement: string;
  page: string;
  sectionType: string;
  role: string;
  url: string;
  provider: string;
  providerImageId?: string;
  creator?: string;
  creatorUrl?: string;
  attribution?: string;
  licence?: string;
  rights: ManifestRights;
  alt: string;
  focalPoint?: { x: number; y: number };
  treatment: string;
  selection: "owner-approved" | "kora-curated" | "unreviewed";
}

export interface ImageManifest {
  version: 1;
  entries: ManifestEntry[];
  summary: {
    placements: number;
    distinctImages: number;
    bySource: Record<string, number>;
    withoutAlt: number;
    needsCredit: number;
    creditedInFooter: number;
  };
}

const rightsOf = (sourceType: string): ManifestRights =>
  sourceType === "owner-supplied" || sourceType === "owner-approved-stored"
    ? "owner-supplied"
    : sourceType === "ai-generated"
      ? "generated"
      : sourceType === "licensed-stock"
        ? "provider-licence"
        : "unknown";

export function buildImageManifest(spec: SiteSpecV3): ImageManifest {
  const entries: ManifestEntry[] = [];
  const add = (
    page: string,
    sectionType: string,
    placement: string,
    m: unknown,
  ) => {
    const x = m as
      | {
          url: string;
          alt: string;
          role?: string;
          treatment?: string;
          focalPoint?: { x: number; y: number };
          provenance?: {
            sourceType: string;
            provider?: string;
            license?: string;
            attribution?: string;
            creatorName?: string;
            creatorUrl?: string;
            providerImageId?: string;
            reviewStatus?: ManifestEntry["selection"];
          };
        }
      | undefined;
    if (!x?.url) return;
    const pr = x.provenance;
    const bundled = x.url.startsWith("/_kora/media/");
    entries.push({
      placement,
      page,
      sectionType,
      role: x.role ?? "feature",
      url: x.url,
      provider:
        pr?.provider ??
        (bundled
          ? "Kora catalogue"
          : pr?.sourceType === "owner-supplied"
            ? "owner"
            : "unknown"),
      ...(pr?.providerImageId ? { providerImageId: pr.providerImageId } : {}),
      ...(pr?.creatorName ? { creator: pr.creatorName } : {}),
      ...(pr?.creatorUrl ? { creatorUrl: pr.creatorUrl } : {}),
      ...(pr?.attribution ? { attribution: pr.attribution } : {}),
      ...(pr?.license ? { licence: pr.license } : {}),
      rights:
        bundled && pr?.sourceType === "licensed-stock"
          ? "kora-licensed"
          : rightsOf(pr?.sourceType ?? "unknown"),
      alt: x.alt,
      ...(x.focalPoint ? { focalPoint: x.focalPoint } : {}),
      treatment: x.treatment ?? "none",
      selection: pr?.reviewStatus ?? "unreviewed",
    });
  };
  for (const p of spec.pages)
    p.sections.forEach((s, i) => {
      const a = s as unknown as {
        media?: unknown;
        items?: Array<{ media?: unknown }>;
      };
      add(p.slug, s.type, `${p.slug}#${i}`, a.media);
      a.items?.forEach((it, j) =>
        add(p.slug, s.type, `${p.slug}#${i}.${j}`, it.media),
      );
    });
  const bySource: Record<string, number> = {};
  for (const e of entries)
    bySource[e.provider] = (bySource[e.provider] ?? 0) + 1;
  const providerImages = entries.filter(
    (e) => e.rights === "provider-licence" && e.creatorUrl,
  );
  return {
    version: 1,
    entries,
    summary: {
      placements: entries.length,
      distinctImages: new Set(entries.map((e) => e.url)).size,
      bySource,
      withoutAlt: entries.filter((e) => !e.alt.trim()).length,
      needsCredit: entries.filter(
        (e) => e.rights === "provider-licence" && e.provider === "Unsplash",
      ).length,
      creditedInFooter: new Set(providerImages.map((e) => e.url)).size,
    },
  };
}

export interface Replacement {
  placement: string;
  from: string;
  to: string;
}
/** Which placements show a different picture in `next` than in `prev`. */
export function manifestReplacements(
  prev: ImageManifest,
  next: ImageManifest,
): Replacement[] {
  const before = new Map(prev.entries.map((e) => [e.placement, e.url]));
  return next.entries
    .filter((e) => before.has(e.placement) && before.get(e.placement) !== e.url)
    .map((e) => ({
      placement: e.placement,
      from: before.get(e.placement)!,
      to: e.url,
    }));
}
