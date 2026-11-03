import { fatigueAvoid, tasteSignals } from "@kora/creative";
import type { PlanV3Options } from "@kora/site-schema";
import type { BrandOsStore } from "./brand-os-store.js";

/**
 * What this account's earlier design decisions imply for the next set of directions: rotate away from a design
 * language the account keeps receiving, and (with three or more judgements) nudge which direction is recommended.
 * An account with no history gets exactly what it would have got before, so first impressions are unchanged.
 */
export async function designContext(
  store: BrandOsStore,
  orgId: string,
): Promise<Pick<PlanV3Options, "compose" | "taste">> {
  const history = await store.designHistory(orgId);
  const avoid = fatigueAvoid(history);
  const taste = tasteSignals(history);
  return {
    ...(avoid.length ? { compose: { avoidGrammarIds: avoid } } : {}),
    ...(taste.confident ? { taste } : {}),
  };
}
