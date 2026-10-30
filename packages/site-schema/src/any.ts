import type { SiteFiles } from "./hash.js";
import { renderSite, type RenderContext } from "./render.js";
import { parseSiteSpec, type SiteSpec } from "./spec.js";
import { renderSiteV2 } from "./v2/render.js";
import { parseSiteSpecV2, type SiteSpecV2 } from "./v2/spec.js";

/** Both generations of the spec stay valid forever: old versions must render, publish, roll back and verify. */
export type AnySiteSpec = SiteSpec | SiteSpecV2;

export const specVersionOf = (input: unknown): 1 | 2 =>
  input &&
  typeof input === "object" &&
  (input as { version?: unknown }).version === 2
    ? 2
    : 1;

export const parseAnySiteSpec = (input: unknown): AnySiteSpec =>
  specVersionOf(input) === 2 ? parseSiteSpecV2(input) : parseSiteSpec(input);

/** The single entry point the control plane uses; the renderer remains the enforcement boundary. */
export function renderAnySite(
  spec: AnySiteSpec,
  ctx: RenderContext = {},
): SiteFiles {
  return spec.version === 2 ? renderSiteV2(spec, ctx) : renderSite(spec, ctx);
}
