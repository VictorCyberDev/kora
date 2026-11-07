/**
 * Shared request accounting. A provider's hourly allowance belongs to the whole deployment, not to one process, so the
 * counter sits behind an interface: in memory for tests and single instances, in the database for several instances.
 */
export interface QuotaDecision {
  allowed: boolean;
  /** Requests still unspent in this window after this decision, as far as we know. */
  remaining: number;
  /** When the window resets. */
  resetsAt: number;
}

export interface QuotaStore {
  /**
   * Atomically spends one request unless that would leave fewer than `reserve` unspent. `limit` is the provider's hourly
   * allowance. Implementations must be safe under concurrent callers across instances.
   */
  tryConsume(
    provider: string,
    limit: number,
    reserve: number,
    now: number,
  ): Promise<QuotaDecision>;
  /** Records what the provider itself reported (X-Ratelimit-Remaining), which wins over our own count when lower. */
  observe(
    provider: string,
    remaining: number,
    limit: number,
    now: number,
  ): Promise<void>;
  /** Marks the provider exhausted until the end of the window (after a 429). */
  exhaust(provider: string, now: number): Promise<void>;
}

export const HOUR_MS = 3_600_000;
export const windowStart = (now: number) => Math.floor(now / HOUR_MS) * HOUR_MS;

export class InMemoryQuota implements QuotaStore {
  private readonly used = new Map<string, { start: number; used: number }>();
  private cur(provider: string, now: number) {
    const start = windowStart(now);
    const e = this.used.get(provider);
    if (!e || e.start !== start) {
      const fresh = { start, used: 0 };
      this.used.set(provider, fresh);
      return fresh;
    }
    return e;
  }
  tryConsume(
    provider: string,
    limit: number,
    reserve: number,
    now: number,
  ): Promise<QuotaDecision> {
    const e = this.cur(provider, now);
    const resetsAt = e.start + HOUR_MS;
    if (limit - e.used - 1 < reserve)
      return Promise.resolve({
        allowed: false,
        remaining: Math.max(0, limit - e.used),
        resetsAt,
      });
    e.used += 1;
    return Promise.resolve({
      allowed: true,
      remaining: limit - e.used,
      resetsAt,
    });
  }
  observe(
    provider: string,
    remaining: number,
    limit: number,
    now: number,
  ): Promise<void> {
    const e = this.cur(provider, now);
    e.used = Math.max(e.used, limit - remaining);
    return Promise.resolve();
  }
  exhaust(provider: string, now: number): Promise<void> {
    const e = this.cur(provider, now);
    e.used = Number.MAX_SAFE_INTEGER / 2;
    return Promise.resolve();
  }
}
