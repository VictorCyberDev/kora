export interface ReviewInput {
  rating: number;
  body: string;
}

const SENSITIVE =
  /\b(scam|fraud|stole|stolen|thief|refund|sick|food poison|poison|allerg|hospital|injur|lawyer|lawsuit|sue|police|harass|abus|racis|discriminat|rude|insult|threat|dangerous|never again|worst|rotten|fake)\w*/i;

/**
 * A review is sensitive when it is negative or touches money, health, safety or conduct. Kora never drafts or posts a
 * reply to a sensitive review: the owner answers those personally.
 */
export function isSensitive(r: ReviewInput): boolean {
  return r.rating <= 3 || SENSITIVE.test(r.body);
}

/** A short thank-you for clearly positive, non-sensitive reviews only. Returns null when Kora should not draft anything. */
export function suggestReply(
  r: ReviewInput & { author?: string },
  business: string,
  tone: string,
): string | null {
  if (isSensitive(r) || r.rating < 4) return null;
  const who = r.author?.trim() ? ` ${r.author.trim().split(/\s+/)[0]}` : "";
  const t =
    tone === "playful"
      ? "Thank you so much"
      : tone === "premium"
        ? "Thank you for your kind words"
        : tone === "direct"
          ? "Thanks for the review"
          : "Thank you for the lovely review";
  return `${t}${who}! We're glad you chose ${business}. We look forward to serving you again.`;
}

export interface ReviewSummary {
  count: number;
  average: number | null;
  unanswered: number;
  needsYou: number;
  /** Words at least three different reviews mention; empty when there is not enough to say anything. */
  themes: Array<{ word: string; reviews: number }>;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
const STOP = new Set(
  "the a an and or but of to in on at for with was were is are it its this that i we you they he she my our your their me us had have has not no very so as be been from by just really also too than then there here would could can will".split(
    " ",
  ),
);
export function summarizeReviews(
  rows: Array<{
    rating: number;
    body: string;
    status: string;
    sensitive: boolean;
  }>,
): ReviewSummary {
  const dist = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  } as ReviewSummary["distribution"];
  const seen = new Map<string, number>();
  for (const r of rows) {
    dist[r.rating as 1 | 2 | 3 | 4 | 5]++;
    for (const w of new Set(r.body.toLowerCase().match(/[a-z]{4,}/g) ?? []))
      if (!STOP.has(w)) seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const themes = [...seen]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word, reviews]) => ({ word, reviews }));
  return {
    count: rows.length,
    average: rows.length
      ? Math.round(
          (rows.reduce((a, r) => a + r.rating, 0) / rows.length) * 10,
        ) / 10
      : null,
    unanswered: rows.filter((r) => r.status === "NEW" || r.status === "SEEN")
      .length,
    needsYou: rows.filter(
      (r) => r.sensitive && r.status !== "REPLIED" && r.status !== "DISMISSED",
    ).length,
    themes,
    distribution: dist,
  };
}
