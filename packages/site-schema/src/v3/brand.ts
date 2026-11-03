import {
  brandOsFromDirection,
  brandOsHash,
  GRAMMARS,
  type BrandOS,
  type CreativeDirection,
} from "@kora/creative";
import type { SiteSpecV3 } from "./spec.js";

/** Rebuilds the Brand OS a spec embodies. Used after the owner changes the brand, so version N+1 is recorded. */
export function brandOsOfSpec(
  spec: SiteSpecV3,
  version: number,
  ctas: string[] = [],
): BrandOS {
  const g = GRAMMARS.find((x) => x.id === spec.brand.grammarId);
  const d: CreativeDirection = {
    id: spec.brand.directionId,
    index: spec.meta.direction,
    grammarId: spec.brand.grammarId,
    name: spec.brand.directionName,
    concept: g?.concept ?? "",
    businessRationale: "",
    visualRationale: "",
    strategy: spec.brand.strategy,
    genome: spec.design.genome,
    colorwayId: spec.design.colorwayId,
    paletteBehaviour: "",
    typographySummary: "",
    compositionSummary: `${spec.design.genome.compositionMode.replace(/-/g, " ")}, ${spec.design.genome.density} density`,
    motionSummary: "",
    ctaStrategy: "",
    signatureDevice: g?.signature ?? { name: "", description: "" },
    pagePhilosophy: "",
    campaignBehaviour: g?.campaignBehaviour ?? "",
    antiPatterns: spec.brand.strategy.antiTraits,
    artDirection: spec.artDirection,
    seed: spec.design.seed,
    fit: { score: 0, reasons: [] },
  };
  const p = spec.design.palette;
  const prev =
    version > 1 ? ({ version: version - 1 } as unknown as BrandOS) : undefined;
  return brandOsFromDirection(d, {
    name: spec.business.name,
    logoAssetId: spec.business.logo?.assetId ?? null,
    palette: {
      background: p.background,
      foreground: p.foreground,
      primary: p.primary,
      secondary: p.secondary,
      accent: p.accent,
    },
    mode: spec.design.mode,
    ctas,
    ...(prev ? { previous: prev } : {}),
  });
}

/** Stamps the spec with the Brand OS it now embodies (version + hash). Pure. */
export function withBrandOs(
  spec: SiteSpecV3,
  version: number,
): { spec: SiteSpecV3; brandOs: BrandOS } {
  const first = spec.pages[0]?.sections[0];
  const ctas =
    first && first.type === "hero" && first.primaryCta
      ? [first.primaryCta.label]
      : [];
  const brandOs = brandOsOfSpec(spec, version, ctas);
  return {
    spec: {
      ...spec,
      brand: {
        ...spec.brand,
        osVersion: brandOs.version,
        osHash: brandOsHash(brandOs),
      },
    },
    brandOs,
  };
}
