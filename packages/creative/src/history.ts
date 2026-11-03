/**
 * Design history and taste, kept deliberately modest.
 *
 * - Template fatigue: an account that keeps receiving (or choosing) the same design language is steered away from it,
 *   weighted by recency, so a fortnight-old choice matters more than a year-old one. The result feeds the existing
 *   `avoidGrammarIds` option, so the engine's own replacement logic (never below a fit floor) does the rest.
 * - Taste: nothing is claimed from fewer than three judgements (ADR-028). Below that, ranking is untouched.
 *   Taste only re-ranks which direction is *recommended*; all three stay on offer and the owner always decides.
 */

export type DesignOutcome = "chosen" | "rejected";

/** One remembered design decision: what was chosen or passed over, in design terms rather than tastes in words. */
export interface DesignTrace {
  grammarId: string;
  typeVoice: string;
  colorwayId: string;
  compositionMode: string;
  outcome: DesignOutcome;
  /** Epoch milliseconds. */
  at: number;
}

const DAY = 86_400_000;
/** Half-life of a design decision: after this long it counts half as much. */
export const HISTORY_HALF_LIFE_DAYS = 45;
export const MIN_JUDGEMENTS = 3;

export const recencyWeight = (at: number, now: number): number =>
  Math.pow(0.5, Math.max(0, now - at) / DAY / HISTORY_HALF_LIFE_DAYS);

/**
 * Design languages to rotate away from. A grammar is avoided when its recency-weighted use clears the threshold
 * (two recent choices, or one very recent choice plus an older one). At most two are avoided so three genuinely
 * different directions always remain available.
 */
export function fatigueAvoid(
  history: DesignTrace[],
  now: number = Date.now(),
  threshold = 1.2,
): string[] {
  const use = new Map<string, number>();
  for (const h of history) {
    if (h.outcome !== "chosen") continue;
    use.set(
      h.grammarId,
      (use.get(h.grammarId) ?? 0) + recencyWeight(h.at, now),
    );
  }
  return [...use.entries()]
    .filter(([, w]) => w >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id);
}

export interface TasteSignals {
  judgements: number;
  confident: boolean;
  preferredGrammars: string[];
  preferredTypeVoices: string[];
  rejectedGrammars: string[];
}

const top = (m: Map<string, number>, min: number) =>
  [...m.entries()]
    .filter(([, w]) => w >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

/** Taste from repeated, recency-weighted choices. Fewer than three judgements: nothing is claimed. */
export function tasteSignals(
  history: DesignTrace[],
  now: number = Date.now(),
): TasteSignals {
  const chosen = history.filter((h) => h.outcome === "chosen");
  const rejected = history.filter((h) => h.outcome === "rejected");
  const judgements = chosen.length + rejected.length;
  const none: TasteSignals = {
    judgements,
    confident: false,
    preferredGrammars: [],
    preferredTypeVoices: [],
    rejectedGrammars: [],
  };
  if (judgements < MIN_JUDGEMENTS) return none;
  const g = new Map<string, number>();
  const t = new Map<string, number>();
  const r = new Map<string, number>();
  for (const h of chosen) {
    const w = recencyWeight(h.at, now);
    g.set(h.grammarId, (g.get(h.grammarId) ?? 0) + w);
    t.set(h.typeVoice, (t.get(h.typeVoice) ?? 0) + w);
  }
  for (const h of rejected)
    r.set(h.grammarId, (r.get(h.grammarId) ?? 0) + recencyWeight(h.at, now));
  const out: TasteSignals = {
    judgements,
    confident: false,
    preferredGrammars: top(g, 1),
    preferredTypeVoices: top(t, 1),
    // being passed over twice (recency-weighted) is a pattern; once is noise
    rejectedGrammars: top(r, 1.5),
  };
  out.confident =
    out.preferredGrammars.length +
      out.preferredTypeVoices.length +
      out.rejectedGrammars.length >
    0;
  return out;
}

export interface RerankableDirection {
  grammarId: string;
  genome: { typeVoice: string };
}

/**
 * Nudges the recommendation toward what this owner has repeatedly chosen. Moves scores by less than the gaps the
 * engine's own fit rules create for a poor match, so taste can break a near tie but cannot recommend a bad fit.
 */
export function rerankByTaste(
  directions: RerankableDirection[],
  scores: number[],
  taste: TasteSignals,
): {
  index: number;
  adjusted: number[];
  changed: boolean;
  because: string | null;
} {
  const best = (xs: number[]) =>
    xs.reduce((b, x, i) => (x > xs[b]! ? i : b), 0);
  const base = best(scores);
  if (!taste.confident)
    return { index: base, adjusted: scores, changed: false, because: null };
  const adjusted = scores.map((s, i) => {
    const d = directions[i]!;
    let x = s;
    if (taste.preferredGrammars.includes(d.grammarId)) x += 1;
    if (taste.preferredTypeVoices.includes(d.genome.typeVoice)) x += 0.5;
    if (taste.rejectedGrammars.includes(d.grammarId)) x -= 1.5;
    return Math.round(x * 10) / 10;
  });
  const index = best(adjusted);
  const d = directions[index]!;
  const because =
    index !== base
      ? taste.preferredGrammars.includes(d.grammarId)
        ? "it is close to the directions you have chosen before"
        : "it avoids directions you have passed over before"
      : null;
  return { index, adjusted, changed: index !== base, because };
}
