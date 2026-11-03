import type postgres from "postgres";
import type { MediaQuality } from "../growth/owner-media.js";

/** What the design planner needs from the owner's library. Pure data; no bytes. */
export interface OwnerMediaForPlanner {
  id: string;
  kind: "logo" | "photo";
  role: string;
  url: string;
  srcset: Array<{ url: string; width: number }>;
  alt: string;
  width: number;
  height: number;
  focal: { x: number; y: number };
  quality: MediaQuality;
}

/** Public https base for owner pictures, or null when none is configured (then designs fall back to stock/graphics). */
export function mediaBase(publicUrl: string | undefined): string | null {
  if (!publicUrl) return null;
  const b = publicUrl.replace(/\/+$/, "");
  return /^https:\/\//.test(b) ? b : null;
}
export const publicMediaUrl = (
  base: string,
  siteId: string,
  sha: string,
  file: string,
) => `${base}/api/public/sites/${siteId}/m/${sha}/${file}`;

export async function loadOwnerMedia(
  sql: postgres.Sql,
  siteId: string,
  base: string | null,
): Promise<{
  photos: OwnerMediaForPlanner[];
  logo: OwnerMediaForPlanner | null;
}> {
  if (!base) return { photos: [], logo: null };
  const rows =
    await sql`SELECT id, kind, role, sha256, width, height, alt, focal_x, focal_y, quality, (v640 IS NOT NULL) AS has640, (v1920 IS NOT NULL) AS has1920
    FROM owner_media WHERE site_id=${siteId} AND removed_at IS NULL ORDER BY created_at ASC`;
  const map = (r: postgres.Row): OwnerMediaForPlanner => {
    const sha = String(r.sha256);
    const isLogo = r.kind === "logo";
    const srcset: OwnerMediaForPlanner["srcset"] = [];
    if (!isLogo) {
      if (r.has640)
        srcset.push({
          url: publicMediaUrl(base, siteId, sha, "w640.webp"),
          width: 640,
        });
      srcset.push({
        url: publicMediaUrl(base, siteId, sha, "w1280.webp"),
        width: Math.min(1280, Number(r.width)),
      });
      if (r.has1920)
        srcset.push({
          url: publicMediaUrl(base, siteId, sha, "w1920.webp"),
          width: 1920,
        });
    }
    return {
      id: String(r.id),
      kind: r.kind as "logo" | "photo",
      role: String(r.role),
      url: publicMediaUrl(
        base,
        siteId,
        sha,
        isLogo ? "logo.png" : "w1280.webp",
      ),
      srcset,
      alt: String(r.alt),
      width: Number(r.width),
      height: Number(r.height),
      focal: { x: Number(r.focal_x), y: Number(r.focal_y) },
      quality: r.quality as MediaQuality,
    };
  };
  const all = rows.map(map);
  const logos = all.filter((x) => x.kind === "logo");
  return {
    photos: all.filter((x) => x.kind === "photo"),
    logo: logos[logos.length - 1] ?? null,
  };
}
