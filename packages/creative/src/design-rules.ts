/**
 * First-party creative guidance registry. This is not an installation or copy of
 * any third-party skill. External sources require separate license approval.
 * Rules are evaluated at runtime, never executed as arbitrary downloaded code.
 */
import { z } from "zod";

export const DesignPhaseSchema = z.enum([
  "brief", "concept", "composition", "render", "critique", "revise", "validate",
]);
export const DesignPrioritySchema = z.enum([
  "security", "accessibility", "approved-brand", "functionality",
  "creative", "refinement", "decoration",
]);
export const DesignRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  source: z.literal("kora-first-party"),
  version: z.literal(1),
  phase: DesignPhaseSchema,
  priority: DesignPrioritySchema,
  industries: z.array(z.string()).min(1),
  instruction: z.string().min(8).max(280),
  incompatibleWith: z.array(z.string()).default([]),
});
export type DesignRule = z.infer<typeof DesignRuleSchema>;

const priority: Record<z.infer<typeof DesignPrioritySchema>, number> = {
  security: 0,
  accessibility: 1,
  "approved-brand": 2,
  functionality: 3,
  creative: 4,
  refinement: 5,
  decoration: 6,
};

export const FIRST_PARTY_DESIGN_RULES = z.array(DesignRuleSchema).parse([
  {
    id: "accessible-navigation", source: "kora-first-party", version: 1,
    phase: "validate", priority: "accessibility", industries: ["*"],
    instruction: "Navigation and interactive controls must remain keyboard accessible.",
    incompatibleWith: ["decorative-navigation-only"],
  },
  {
    id: "verified-business-claims", source: "kora-first-party", version: 1,
    phase: "brief", priority: "security", industries: ["*"],
    instruction: "Do not present unverified business facts, testimonials or awards as real.",
    incompatibleWith: ["invented-social-proof"],
  },
  {
    id: "food-photography-relevance", source: "kora-first-party", version: 1,
    phase: "composition", priority: "creative", industries: ["food"],
    instruction: "Prioritize relevant food imagery with a crop that preserves the product.",
    incompatibleWith: [],
  },
  {
    id: "professional-trust-hierarchy", source: "kora-first-party", version: 1,
    phase: "composition", priority: "creative", industries: ["professional"],
    instruction: "Use clear expertise and service hierarchy without invented credentials.",
    incompatibleWith: [],
  },
  {
    id: "avoid-repetitive-grids", source: "kora-first-party", version: 1,
    phase: "critique", priority: "refinement", industries: ["*"],
    instruction: "Avoid three consecutive sections with the same card-grid composition.",
    incompatibleWith: [],
  },
]);
export const RuleSelectionSchema = z.object({
  industry: z.string().min(1),
  phase: DesignPhaseSchema.optional(),
  disabledRuleIds: z.array(z.string()).default([]),
});
export type RuleSelection = z.input<typeof RuleSelectionSchema>;

/** Stable, deterministic selection. A blocked rule never executes. */
export function selectDesignRules(
  input: RuleSelection,
  registry: readonly DesignRule[] = FIRST_PARTY_DESIGN_RULES,
): DesignRule[] {
  const args = RuleSelectionSchema.parse(input);
  const disabled = new Set(args.disabledRuleIds);
  const candidates = registry
    .map((r) => DesignRuleSchema.parse(r))
    .filter((r) =>
      !disabled.has(r.id) &&
      (r.industries.includes("*") || r.industries.includes(args.industry)) &&
      (!args.phase || r.phase === args.phase),
    )
    .sort((a, b) => priority[a.priority] - priority[b.priority] || a.id.localeCompare(b.id));

  const selected: DesignRule[] = [];
  const active = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.incompatibleWith.some((id) => active.has(id))) continue;
    if (selected.some((rule) => rule.incompatibleWith.includes(candidate.id))) continue;
    if (active.has(candidate.id)) continue;
    selected.push(candidate);
    active.add(candidate.id);
  }
  return selected;
}
