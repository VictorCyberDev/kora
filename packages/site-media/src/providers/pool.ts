import {
  ProviderError,
  type MediaCandidate,
  type MediaProvider,
} from "./types.js";

/**
 * Candidate pool for one business. A typical session is two to four grouped searches, shared by all three design
 * directions, never one search per section or per direction. Results are cached by query so a repeat costs nothing.
 */
export interface PoolCache {
  get(key: string): Promise<MediaCandidate[] | undefined>;
  set(key: string, v: MediaCandidate[]): Promise<void>;
}
export class InMemoryPoolCache implements PoolCache {
  private readonly m = new Map<string, { at: number; v: MediaCandidate[] }>();
  constructor(
    private readonly ttlMs = 24 * 3_600_000,
    private readonly now: () => number = Date.now,
  ) {}
  get(key: string): Promise<MediaCandidate[] | undefined> {
    const e = this.m.get(key);
    if (!e || this.now() - e.at > this.ttlMs) return Promise.resolve(undefined);
    return Promise.resolve(e.v);
  }
  set(key: string, v: MediaCandidate[]): Promise<void> {
    // Bounded: keys come from callers, so the oldest entries are dropped first.
    while (this.m.size >= 500) this.m.delete(this.m.keys().next().value!);
    this.m.set(key, { at: this.now(), v });
    return Promise.resolve();
  }
}

export interface PoolResult {
  candidates: MediaCandidate[];
  /** Queries answered from the cache, answered by a provider, and skipped for budget or availability. */
  report: {
    cacheHits: number;
    providerCalls: number;
    skipped: Array<{ query: string; reason: string }>;
    failures: Array<{ provider: string; code: string }>;
  };
}

const norm = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

export async function buildCandidatePool(opts: {
  intents: string[];
  providers: MediaProvider[];
  cache?: PoolCache;
  /** Most provider calls this generation may spend, in total. */
  budget?: number;
  perQuery?: number;
}): Promise<PoolResult> {
  const budget = opts.budget ?? 4;
  const cache = opts.cache ?? new InMemoryPoolCache();
  const queries = [...new Set(opts.intents.map(norm).filter(Boolean))].slice(
    0,
    budget,
  );
  const report: PoolResult["report"] = {
    cacheHits: 0,
    providerCalls: 0,
    skipped: [],
    failures: [],
  };
  const byId = new Map<string, MediaCandidate>();
  let spent = 0;
  const halted = new Set<string>();
  for (const q of queries)
    for (const p of opts.providers) {
      if (halted.has(p.id)) {
        report.skipped.push({
          query: q,
          reason: `${p.id} halted after a rate limit`,
        });
        continue;
      }
      if (!p.available()) {
        report.skipped.push({ query: q, reason: `${p.id} not available` });
        continue;
      }
      const key = `${p.id}|${q}|${opts.perQuery ?? 12}`;
      const hit = await cache.get(key);
      if (hit) {
        report.cacheHits++;
        for (const c of hit) byId.set(`${c.provider}:${c.id}`, c);
        continue;
      }
      if (spent >= budget) {
        report.skipped.push({ query: q, reason: "generation budget used" });
        continue;
      }
      spent++;
      report.providerCalls++;
      try {
        const found = await p.search({
          query: q,
          orientation: "landscape",
          perPage: opts.perQuery ?? 12,
        });
        await cache.set(key, found);
        for (const c of found) byId.set(`${c.provider}:${c.id}`, c);
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : "upstream";
        report.failures.push({ provider: p.id, code });
        // quota and rate-limit failures end this provider's work for the generation; the others carry on
        if (
          code === "rate_limited" ||
          code === "quota_reserved" ||
          code === "unauthorized"
        )
          halted.add(p.id);
      }
    }
  return { candidates: [...byId.values()], report };
}

/** Ranks candidates for a placement: right shape, large enough, and described in terms of the subject. */
export function rankCandidates(
  cands: MediaCandidate[],
  want: {
    subject: string;
    orientation: MediaCandidate["orientation"];
    used?: Set<string>;
  },
): MediaCandidate[] {
  const words = want.subject
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
  return cands
    .map((c) => {
      const d = c.description.toLowerCase();
      const hits = words.filter((w) => d.includes(w)).length;
      const score =
        hits * 3 +
        (c.orientation === want.orientation ? 2 : 0) +
        (c.width >= 1600 ? 1 : 0) -
        (want.used?.has(`${c.provider}:${c.id}`) ? 4 : 0);
      return { c, score, hits };
    })
    .filter((x) => x.hits > 0) // a picture whose description never mentions the subject is not relevant
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
