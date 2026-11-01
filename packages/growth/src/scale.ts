/** M26: cost and scale. Context packets keep model calls small and attributable; budgets stop runaway spend. */
export interface ContextPacket {
  purpose: string;
  facts: Array<{ key: string; value: string }>;
  voice: { tone: string; use: string[]; avoid: string[] };
  approxTokens: number;
}

const tok = (s: string) => Math.ceil(s.length / 4);

export function buildContextPacket(
  purpose: string,
  facts: Array<{ key: string; value: string; relevance: number }>,
  voice: ContextPacket["voice"],
  budgetTokens = 800,
): ContextPacket {
  const sorted = [...facts].sort(
    (a, b) => b.relevance - a.relevance || a.key.localeCompare(b.key),
  );
  const kept: ContextPacket["facts"] = [];
  let used = tok(JSON.stringify(voice)) + tok(purpose);
  for (const f of sorted) {
    const c = tok(f.key) + tok(f.value);
    if (used + c > budgetTokens) continue;
    kept.push({ key: f.key, value: f.value });
    used += c;
  }
  return { purpose, facts: kept, voice, approxTokens: used };
}

export type CostDecision =
  | { allow: true; remaining: number }
  | { allow: false; reason: "monthly_budget" | "per_call_cap" };

export function costGate(i: {
  spentMinor: number;
  budgetMinor: number;
  estimateMinor: number;
  perCallCapMinor: number;
}): CostDecision {
  if (i.estimateMinor > i.perCallCapMinor)
    return { allow: false, reason: "per_call_cap" };
  if (i.spentMinor + i.estimateMinor > i.budgetMinor)
    return { allow: false, reason: "monthly_budget" };
  return {
    allow: true,
    remaining: i.budgetMinor - i.spentMinor - i.estimateMinor,
  };
}

export interface Budget {
  id: string;
  max: number;
}
export const PERFORMANCE_BUDGETS: Budget[] = [
  { id: "site_html_kb", max: 200 },
  { id: "site_total_kb", max: 600 },
  { id: "site_requests", max: 25 },
  { id: "app_js_kb_gzip", max: 350 },
];
export function budgetBreaches(measured: Record<string, number>): string[] {
  return PERFORMANCE_BUDGETS.filter((b) => (measured[b.id] ?? 0) > b.max).map(
    (b) => `${b.id}: ${measured[b.id]} > ${b.max}`,
  );
}
