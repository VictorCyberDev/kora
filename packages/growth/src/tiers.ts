/**
 * Plan tiers as feature entitlements. The tier names and prices are commercial hypotheses and live in the
 * plan catalog; this module only answers "does this tier include this feature", in one place.
 */
export const TIERS = ["TRIAL", "LAUNCH", "PLUS", "PRO"] as const;
export type Tier = (typeof TIERS)[number];

export const FEATURES = [
  "presence.graph",
  "presence.health",
  "brand.kit",
  "channels.connect",
  "customers.hub",
  "content.studio",
  "brand.studio",
  "motion.studio",
  "calendar",
  "publishing",
  "marketing.agent",
  "growth.brief",
  "campaigns",
  "attribution",
  "analytics",
  "reviews",
  "team.members",
] as const;
export type Feature = (typeof FEATURES)[number];

const LAUNCH: Feature[] = [
  "presence.graph",
  "presence.health",
  "brand.kit",
  "channels.connect",
  "customers.hub",
  "content.studio",
  "brand.studio",
];
const PLUS: Feature[] = [
  ...LAUNCH,
  "motion.studio",
  "calendar",
  "publishing",
  "attribution",
  "analytics",
  "reviews",
];
const PRO: Feature[] = [
  ...PLUS,
  "marketing.agent",
  "growth.brief",
  "campaigns",
  "team.members",
];

export const TIER_FEATURES: Record<Tier, ReadonlySet<Feature>> = {
  // A trial shows everything, so an owner can judge the product before choosing a plan.
  TRIAL: new Set(PRO),
  LAUNCH: new Set(LAUNCH),
  PLUS: new Set(PLUS),
  PRO: new Set(PRO),
};

export const hasFeature = (tier: Tier, feature: Feature): boolean =>
  TIER_FEATURES[tier].has(feature);

/** The lowest paid tier that includes a feature, for "available on Plus" messaging. */
export function lowestTierWith(feature: Feature): Tier {
  return (
    (["LAUNCH", "PLUS", "PRO"] as const).find((t) => hasFeature(t, feature)) ??
    "PRO"
  );
}
