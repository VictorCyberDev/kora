import {
  hasFeature,
  lowestTierWith,
  type Feature,
  type Tier,
} from "@kora/growth";
import { HttpError } from "../platform/http.js";
import type { BillingService } from "../platform/billing.js";

/** Maps a plan to a feature tier. Plan codes come from the catalog; unknown paid plans get the lowest paid tier. */
export function tierForPlan(
  code: string | null,
  state: string | null,
): Tier | null {
  if (!code || !state) return null;
  if (code === "trial") return "TRIAL";
  const c = code.toLowerCase();
  if (c.includes("pro")) return "PRO";
  if (c.includes("plus") || c.includes("business")) return "PLUS";
  return "LAUNCH";
}

export interface OrgFeatures {
  tier: Tier | null;
  restricted: boolean;
  reason: string | null;
  can(feature: Feature): boolean;
}

export async function orgFeatures(
  billing: BillingService,
  orgId: string,
): Promise<OrgFeatures> {
  const { subscription, entitlements } = await billing.entitlements(orgId);
  const tier = tierForPlan(
    subscription?.planCode ?? null,
    subscription?.state ?? null,
  );
  const restricted = !tier || !entitlements.canGenerate;
  return {
    tier,
    restricted,
    reason: entitlements.restrictedReason,
    can: (f) => Boolean(tier) && !restricted && hasFeature(tier, f),
  };
}

/** Throws 402 with an owner-readable message. The only place a plan gate is decided for growth features. */
export async function requireFeature(
  billing: BillingService,
  orgId: string,
  feature: Feature,
): Promise<void> {
  const f = await orgFeatures(billing, orgId);
  if (f.can(feature)) return;
  if (f.restricted)
    throw new HttpError(
      402,
      "plan_restriction",
      f.reason ?? "Your plan does not include this. Choose a plan to continue.",
    );
  throw new HttpError(
    402,
    "plan_restriction",
    `This is included from the ${lowestTierWith(feature)} plan.`,
  );
}
