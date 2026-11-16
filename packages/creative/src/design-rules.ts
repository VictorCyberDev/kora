/**
 * License-aware design guidance derived from reviewed, pinned upstream sources.
 * Data-only rules are evaluated locally; no third-party scripts can execute.
 */
import { z } from "zod";

export const DesignPhaseSchema = z.enum([
  "brief",
  "concept",
  "composition",
  "render",
  "critique",
  "revise",
  "validate",
]);
export const DesignPrioritySchema = z.enum([
  "security",
  "accessibility",
  "approved-brand",
  "functionality",
  "creative",
  "refinement",
  "decoration",
]);
export const DesignRuleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  source: z.enum([
    "kora-first-party",
    "anthropic-frontend",
    "anthropic-canvas",
    "anthropic-brand",
    "impeccable",
    "vercel-interface",
    "ui-ux-pro-max",
  ]),
  upstreamCommit: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  license: z.enum(["Apache-2.0", "MIT"]).optional(),
  effect: z
    .enum([
      "editorial-photo-hero",
      "restrained-motion",
      "section-rhythm",
      "clean-contact",
      "brand-lock",
      "typography-hierarchy",
      "responsive-crop",
    ])
    .optional(),
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
    id: "accessible-navigation",
    source: "kora-first-party",
    version: 1,
    phase: "validate",
    priority: "accessibility",
    industries: ["*"],
    instruction:
      "Navigation and interactive controls must remain keyboard accessible.",
    incompatibleWith: ["decorative-navigation-only"],
  },
  {
    id: "verified-business-claims",
    source: "kora-first-party",
    version: 1,
    phase: "brief",
    priority: "security",
    industries: ["*"],
    instruction:
      "Do not present unverified business facts, testimonials or awards as real.",
    incompatibleWith: ["invented-social-proof"],
  },
  {
    id: "food-photography-relevance",
    source: "kora-first-party",
    version: 1,
    phase: "composition",
    priority: "creative",
    industries: ["food"],
    instruction:
      "Prioritize relevant food imagery with a crop that preserves the product.",
    incompatibleWith: [],
  },
  {
    id: "professional-trust-hierarchy",
    source: "kora-first-party",
    version: 1,
    phase: "composition",
    priority: "creative",
    industries: ["professional"],
    instruction:
      "Use clear expertise and service hierarchy without invented credentials.",
    incompatibleWith: [],
  },
  {
    id: "avoid-repetitive-grids",
    source: "kora-first-party",
    version: 1,
    phase: "critique",
    priority: "refinement",
    industries: ["*"],
    instruction:
      "Avoid three consecutive sections with the same card-grid composition.",
    incompatibleWith: [],
  },
]);
/**
 * These are Kora-authored, concise operational rules derived from reviewed
 * permissively licensed guidance. The upstream skill text and branded
 * assets are not embedded or executed. Source SHAs and licenses are pinned
 * in third_party/manifest.json; reference notices are maintained separately.
 */
export const LICENSED_DESIGN_RULES = z.array(DesignRuleSchema).parse([
  {
    id: "editorial-food-photo",
    source: "anthropic-frontend",
    upstreamCommit: "1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064",
    license: "Apache-2.0",
    version: 1,
    phase: "composition",
    priority: "creative",
    industries: ["food", "hospitality"],
    effect: "editorial-photo-hero",
    instruction:
      "If approved photography exists, compose a deliberate editorial image-and-type hero.",
    incompatibleWith: [],
  },
  {
    id: "accessible-interactions",
    source: "vercel-interface",
    upstreamCommit: "434b7f91364665f2f733b310ec54809bf8f37937",
    license: "MIT",
    version: 1,
    phase: "validate",
    priority: "accessibility",
    industries: ["*"],
    effect: "clean-contact",
    instruction:
      "Keep clear labels, keyboard reachable actions and visible focus in contact journeys.",
    incompatibleWith: ["decorative-navigation-only"],
  },
  {
    id: "visual-rhythm",
    source: "impeccable",
    upstreamCommit: "d41d9860b0094dcb68030657da63461212835aaa",
    license: "Apache-2.0",
    version: 1,
    phase: "composition",
    priority: "refinement",
    industries: ["*"],
    effect: "section-rhythm",
    instruction:
      "Alternate dense and spacious sections instead of repeating the same card layout.",
    incompatibleWith: [],
  },
  {
    id: "brand-consistency",
    source: "anthropic-brand",
    upstreamCommit: "1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064",
    license: "Apache-2.0",
    version: 1,
    phase: "concept",
    priority: "approved-brand",
    industries: ["*"],
    effect: "brand-lock",
    instruction:
      "Preserve approved customer identity and locked assets across every page.",
    incompatibleWith: [],
  },
  {
    id: "purposeful-motifs",
    source: "anthropic-canvas",
    upstreamCommit: "1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064",
    license: "Apache-2.0",
    version: 1,
    phase: "composition",
    priority: "decoration",
    industries: ["creative", "retail"],
    effect: "restrained-motion",
    instruction:
      "Use restrained shapes as supporting motifs without harming legibility.",
    incompatibleWith: [],
  },
  {
    id: "typographic-hierarchy",
    source: "ui-ux-pro-max",
    upstreamCommit: "e59ff376a41f7ca47b7541ad5c116495cbade3ee",
    license: "MIT",
    version: 1,
    phase: "concept",
    priority: "creative",
    industries: ["*"],
    effect: "typography-hierarchy",
    instruction:
      "Select deliberate display-body typography with consistent hierarchy.",
    incompatibleWith: [],
  },
  {
    id: "responsive-image-composition",
    source: "ui-ux-pro-max",
    upstreamCommit: "e59ff376a41f7ca47b7541ad5c116495cbade3ee",
    license: "MIT",
    version: 1,
    phase: "composition",
    priority: "functionality",
    industries: ["*"],
    effect: "responsive-crop",
    instruction:
      "Preserve focal points and legibility when imagery changes aspect ratio.",
    incompatibleWith: [],
  },
]);

export const APPROVED_DESIGN_RULES: readonly DesignRule[] = [
  ...FIRST_PARTY_DESIGN_RULES,
  ...LICENSED_DESIGN_RULES,
];

export const RuleSelectionSchema = z.object({
  industry: z.string().min(1),
  phase: DesignPhaseSchema.optional(),
  disabledRuleIds: z.array(z.string()).default([]),
});
export type RuleSelection = z.input<typeof RuleSelectionSchema>;

/** Stable, deterministic selection. A blocked rule never executes. */
export function selectDesignRules(
  input: RuleSelection,
  registry: readonly DesignRule[] = APPROVED_DESIGN_RULES,
): DesignRule[] {
  const args = RuleSelectionSchema.parse(input);
  const disabled = new Set(args.disabledRuleIds);
  const candidates = registry
    .map((r) => DesignRuleSchema.parse(r))
    .filter(
      (r) =>
        !disabled.has(r.id) &&
        (r.industries.includes("*") || r.industries.includes(args.industry)) &&
        (!args.phase || r.phase === args.phase),
    )
    .sort(
      (a, b) =>
        priority[a.priority] - priority[b.priority] || a.id.localeCompare(b.id),
    );

  const selected: DesignRule[] = [];
  const active = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.incompatibleWith.some((id) => active.has(id))) continue;
    if (selected.some((rule) => rule.incompatibleWith.includes(candidate.id)))
      continue;
    if (active.has(candidate.id)) continue;
    selected.push(candidate);
    active.add(candidate.id);
  }
  return selected;
}
