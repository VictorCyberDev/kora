import type { SiteFiles } from "./hash.js";
import { renderSite, type RenderContext } from "./render.js";
import { parseSiteSpec, type SiteSpec } from "./spec.js";
import { renderSiteV2 } from "./v2/render.js";
import { parseSiteSpecV2, type SiteSpecV2 } from "./v2/spec.js";
import { renderSiteV3 } from "./v3/render.js";
import { parseSiteSpecV3, type SiteSpecV3 } from "./v3/spec.js";

/** Every generation of the spec stays valid forever: old versions must render, publish, roll back and verify. */
export type AnySiteSpec = SiteSpec | SiteSpecV2 | SiteSpecV3;

export const specVersionOf = (input: unknown): 1 | 2 | 3 => {
  const v =
    input && typeof input === "object"
      ? (input as { version?: unknown }).version
      : undefined;
  return v === 3 ? 3 : v === 2 ? 2 : 1;
};

export const parseAnySiteSpec = (input: unknown): AnySiteSpec => {
  const v = specVersionOf(input);
  return v === 3
    ? parseSiteSpecV3(input)
    : v === 2
      ? parseSiteSpecV2(input)
      : parseSiteSpec(input);
};

/** The single entry point the control plane uses; the renderer remains the enforcement boundary. */
export function renderAnySite(
  spec: AnySiteSpec,
  ctx: RenderContext = {},
): SiteFiles {
  return spec.version === 3
    ? renderSiteV3(spec, ctx)
    : spec.version === 2
      ? renderSiteV2(spec, ctx)
      : renderSite(spec, ctx);
}
