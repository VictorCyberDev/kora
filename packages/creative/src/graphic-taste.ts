/** Remembered graphic preferences, separate from verifiable business facts. */
export const GRAPHIC_STYLES = [
  "editorial",
  "cinematic",
  "asymmetric",
] as const;
export type GraphicStyle = (typeof GRAPHIC_STYLES)[number];

export interface GraphicJudgement {
  style: GraphicStyle;
  outcome: "chosen" | "rejected";
  /** Explicit owner locks take precedence over learned taste. */
  locked: boolean;
  at: string;
}

export function recommendGraphicDirection(
  history: readonly GraphicJudgement[],
): {
  direction: 0 | 1 | 2;
  applied: boolean;
  reason: string | null;
  judgements: number;
} {
  const scores = [0, 0, 0];
  const locks: Array<"chosen" | "rejected" | null> = [null, null, null];
  const usable = history
    .filter(
      (event) =>
        GRAPHIC_STYLES.includes(event.style) &&
        ["chosen", "rejected"].includes(event.outcome) &&
        Number.isFinite(Date.parse(event.at)),
    )
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const event of usable) {
    const i = GRAPHIC_STYLES.indexOf(event.style);
    scores[i] = (scores[i] ?? 0) + (event.outcome === "chosen" ? 1 : -1);
    if (event.locked) locks[i] = event.outcome;
  }
  const preferred = locks.findIndex((x) => x === "chosen");
  if (preferred !== -1)
    return {
      direction: preferred as 0 | 1 | 2,
      applied: true,
      reason: "This visual direction is explicitly preferred by the owner.",
      judgements: usable.length,
    };
  const allowed = GRAPHIC_STYLES.map((_, i) => i).filter(
    (i) => locks[i] !== "rejected",
  );
  if (!allowed.length)
    return {
      direction: 0,
      applied: false,
      reason: "All directions are rejected; the owner must resolve conflicting locks.",
      judgements: usable.length,
    };
  if (locks.some((x) => x === "rejected")) {
    const direction = allowed
      .sort((a, b) => scores[b]! - scores[a]! || a - b)[0]! as 0 | 1 | 2;
    return {
      direction,
      applied: true,
      reason: "An owner-locked rejected visual direction was avoided.",
      judgements: usable.length,
    };
  }
  // Do not infer stable taste from a single subjective reaction.
  if (usable.length < 3)
    return { direction: 0, applied: false, reason: null, judgements: usable.length };
  const ranked = GRAPHIC_STYLES.map((_, i) => i)
    .sort((a, b) => scores[b]! - scores[a]! || a - b);
  const direction = ranked[0]! as 0 | 1 | 2;
  const applied = scores[direction] !== 0 && direction !== 0;
  return {
    direction,
    applied,
    reason: applied ? "Recommendation reflects repeated owner design feedback." : null,
    judgements: usable.length,
  };
}
