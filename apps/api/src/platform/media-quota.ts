import type postgres from "postgres";
import {
  HOUR_MS,
  windowStart,
  type QuotaDecision,
  type QuotaStore,
} from "@kora/site-media";

/**
 * Hourly provider allowance shared by every API instance. The spend is one conditional UPDATE, so the database
 * serialises concurrent callers: two instances can never both spend the last unreserved request.
 */
export class PostgresQuota implements QuotaStore {
  constructor(private readonly sql: postgres.Sql) {}
  private async ensure(provider: string, ws: number) {
    await this
      .sql`INSERT INTO media_provider_quota(provider,window_start,used) VALUES(${provider},to_timestamp(${ws / 1000}),0) ON CONFLICT DO NOTHING`;
  }
  async tryConsume(
    provider: string,
    limit: number,
    reserve: number,
    now: number,
  ): Promise<QuotaDecision> {
    const ws = windowStart(now);
    await this.ensure(provider, ws);
    const r = await this
      .sql`UPDATE media_provider_quota SET used=used+1,updated_at=now()
      WHERE provider=${provider} AND window_start=to_timestamp(${ws / 1000}) AND (${limit}::int - used - 1) >= ${reserve}::int RETURNING used`;
    if (r.length)
      return {
        allowed: true,
        remaining: limit - Number(r[0]!.used),
        resetsAt: ws + HOUR_MS,
      };
    const cur = await this
      .sql`SELECT used FROM media_provider_quota WHERE provider=${provider} AND window_start=to_timestamp(${ws / 1000})`;
    return {
      allowed: false,
      remaining: Math.max(0, limit - Number(cur[0]?.used ?? limit)),
      resetsAt: ws + HOUR_MS,
    };
  }
  async observe(
    provider: string,
    remaining: number,
    limit: number,
    now: number,
  ) {
    const ws = windowStart(now);
    await this.ensure(provider, ws);
    await this
      .sql`UPDATE media_provider_quota SET used=GREATEST(used,${Math.max(0, limit - remaining)}::int),updated_at=now() WHERE provider=${provider} AND window_start=to_timestamp(${ws / 1000})`;
  }
  async exhaust(provider: string, now: number) {
    const ws = windowStart(now);
    await this.ensure(provider, ws);
    await this
      .sql`UPDATE media_provider_quota SET used=1000000,updated_at=now() WHERE provider=${provider} AND window_start=to_timestamp(${ws / 1000})`;
  }
}
