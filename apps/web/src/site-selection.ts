import type { J } from "./api";

export type SiteLike = J & {
  id: string;
  status?: string;
  publicUrl?: string | null;
  currentVersionId?: string | null;
  publishedVersionId?: string | null;
};

/** Prefer the site that actually represents the customer's live business. */
export function preferredSite(rows: SiteLike[]): SiteLike | null {
  return (
    rows.find((s) => Boolean(s.publicUrl || s.publishedVersionId)) ??
    rows.find((s) => Boolean(s.currentVersionId)) ??
    rows[0] ??
    null
  );
}

/**
 * Old builder attempts could create an empty database shell before previews.
 * Reuse only shells that have never generated or published a version.
 */
export function reusableDraftSite(rows: SiteLike[]): SiteLike | null {
  return (
    rows.find(
      (s) =>
        !s.publicUrl &&
        !s.publishedVersionId &&
        !s.currentVersionId &&
        s.status !== "PUBLISHED",
    ) ?? null
  );
}
