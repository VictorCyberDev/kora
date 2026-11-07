import { resolveVertical } from "@kora/creative";
import type { SiteSpecV3 } from "./spec.js";

/**
 * Whether a phone should carry a persistent quick-contact action. Category study
 * (docs/research/CATEGORY-DESIGN-STUDY-A/B-2026.md): small-chops caterers, barbers, restaurants and home-repair trades keep one
 * contact action reachable at any scroll depth; work-led trades (photographers, studios) keep the quieter layout where the
 * navigation action and the footer are the path. A design that already asks for the dock keeps it.
 */
export function wantsDock(spec: SiteSpecV3): boolean {
  if (spec.design.genome.mobileStrategy !== "narrative-stack") return true;
  const b = spec.business;
  const intent = resolveVertical(
    `${b.name} ${b.industry} ${b.description}`,
  ).primaryIntent;
  return !["view-work", "subscribe", "donate"].includes(intent);
}
