/** M21: feedback and taste become memory. Labels are the owner's, never Kora's. */
import type { MemoryEntry } from "./memory.js";

export const TASTE_LABELS = [
  "LOVE",
  "LIKE",
  "NEUTRAL",
  "DISLIKE",
  "OFF_BRAND",
] as const;
export type TasteLabel = (typeof TASTE_LABELS)[number];

export interface Feedback {
  subject: string;
  label: TasteLabel;
  note?: string;
  /** Traits of the thing judged, e.g. ["close-crop","warm-tone","short-caption"]. */
  traits: string[];
}

export function memoryFromFeedback(fb: Feedback): MemoryEntry[] {
  const out: MemoryEntry[] = [
    {
      kind: "DECISION",
      key: `feedback:${fb.subject}`.slice(0, 80),
      value: `${fb.label}${fb.note ? `: ${fb.note}` : ""}`.slice(0, 300),
    },
  ];
  return out;
}

/** Traits the owner keeps liking or rejecting. Needs at least `min` judgements before it claims a preference. */
export function tasteProfile(
  history: readonly Feedback[],
  min = 3,
): { prefers: string[]; avoids: string[] } {
  const score = new Map<string, { n: number; s: number }>();
  const w: Record<TasteLabel, number> = {
    LOVE: 2,
    LIKE: 1,
    NEUTRAL: 0,
    DISLIKE: -1,
    OFF_BRAND: -2,
  };
  for (const h of history)
    for (const t of h.traits) {
      const c = score.get(t) ?? { n: 0, s: 0 };
      c.n++;
      c.s += w[h.label];
      score.set(t, c);
    }
  const prefers: string[] = [],
    avoids: string[] = [];
  for (const [t, c] of score) {
    if (c.n < min) continue;
    const avg = c.s / c.n;
    if (avg >= 1) prefers.push(t);
    else if (avg <= -1) avoids.push(t);
  }
  return { prefers: prefers.sort(), avoids: avoids.sort() };
}
