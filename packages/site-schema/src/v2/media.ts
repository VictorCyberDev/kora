import { artSvg } from "./art.js";
import type { Design, Media } from "./spec.js";

/**
 * Where a site's imagery comes from. The renderer never fetches or invents a picture:
 * a slot either holds media the owner supplied (validated https + alt text) or draws
 * deterministic abstract art from the site's own palette. A broken or unlicensed
 * photo can therefore never appear on a generated site.
 */
export interface MediaProvider {
  readonly id: string;
  /** Returns an inline SVG for a slot, or an <img> for supplied media. */
  render(slot: {
    design: Design;
    media?: Media | undefined;
    variant: number;
    ratio: "wide" | "tall" | "square";
  }): string;
}

/** The default provider: abstract art only. Licence-free, 300 bytes, always on-palette. */
export const abstractArtProvider: MediaProvider = {
  id: "abstract-art",
  render: ({ design, variant, ratio }) => artSvg(design, variant, ratio),
};

export interface MediaCheck {
  ok: boolean;
  problems: string[];
}
/** Owner-supplied media must be https, described, and carry attribution when it is not their own upload. */
export function checkMedia(m: Media): MediaCheck {
  const problems: string[] = [];
  if (!/^https:\/\//.test(m.url))
    problems.push("images must be served over https");
  if (!m.alt.trim())
    problems.push("describe the image (alt text) so everyone can use the page");
  if (m.source === "external" && !m.license && !m.attribution)
    problems.push("an image from another site needs a licence or credit");
  return { ok: problems.length === 0, problems };
}
