import {
  planDirections,
  planDirectionsV3,
  renderAnySite,
  type DesignBrief,
} from "@kora/site-schema";

export interface PlannedDirection {
  index: 0 | 1 | 2;
  name: string;
  summary: string;
  look: string;
  palette: string;
  files: Record<string, string>;
  swatches: string[];
  fontPairing: string;
  extras: Record<string, unknown>;
}

/**
 * Renders the three directions for comparison. Nothing is persisted and no model or image generation runs here,
 * so previews cost nothing and cannot consume a site slot. Forms are stripped: a preview never posts anywhere.
 */
export function previewDirections(
  engine: "v2" | "v3",
  brief: DesignBrief,
): {
  directions: PlannedDirection[];
  recommended: { index: number; reason: string } | null;
} {
  const strip = (files: Record<string, string>) => {
    files["index.html"] = files["index.html"]!.replace(
      /<form[\s\S]*?<\/form>/g,
      "",
    );
    return files;
  };
  if (engine === "v3") {
    const r = planDirectionsV3(brief);
    return {
      recommended: r.recommended,
      directions: r.directions.map((d) => ({
        index: d.index,
        name: d.name,
        summary: d.summary,
        look: d.look,
        palette: d.palette,
        files: strip(renderAnySite(d.spec)),
        swatches: [
          d.spec.design.palette.background,
          d.spec.design.palette.primary,
          d.spec.design.palette.accent,
          d.spec.design.palette.surfaceMuted,
        ],
        fontPairing: d.spec.design.genome.typeVoice,
        extras: {
          engine: "v3",
          recommended: d.recommended,
          essence: d.direction.strategy.brandEssence,
          signature: d.direction.signatureDevice.name,
          why: d.direction.businessRationale,
          avoids: d.direction.antiPatterns.slice(0, 4),
        },
      })),
    };
  }
  return {
    recommended: null,
    directions: planDirections(brief).map((d) => ({
      index: d.index,
      name: d.name,
      summary: d.summary,
      look: d.look,
      palette: d.palette,
      files: strip(renderAnySite(d.spec)),
      swatches: [
        d.spec.design.palette.background,
        d.spec.design.palette.primary,
        d.spec.design.palette.accent,
        d.spec.design.palette.surfaceMuted,
      ],
      fontPairing: d.spec.design.typography.pairing,
      extras: { engine: "v2" },
    })),
  };
}
