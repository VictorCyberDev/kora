import type postgres from "postgres";
import type { MediaCandidate, PoolCache } from "@kora/site-media";

/**
 * Media state that every API instance must see identically: the candidate cache, the rate counters and the record of which
 * pictures an organisation has already selected. Nothing here lives in process memory.
 */
export class PostgresPoolCache implements PoolCache {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly ttlMs = 24 * 3_600_000,
  ) {}
  async get(key: string): Promise<MediaCandidate[] | undefined> {
    const [provider = "", ...rest] = key.split("|");
    const r = await this
      .sql`SELECT payload FROM media_candidate_cache WHERE provider=${provider} AND query_key=${rest.join("|")} AND fetched_at > now() - make_interval(secs => ${this.ttlMs / 1000})`;
    return r[0] ? (r[0].payload as MediaCandidate[]) : undefined;
  }
  async set(key: string, v: MediaCandidate[]): Promise<void> {
    const [provider = "", ...rest] = key.split("|");
    await this
      .sql`INSERT INTO media_candidate_cache(provider,query_key,payload,fetched_at) VALUES(${provider},${rest.join("|").slice(0, 300)},${this.sql.json(v as unknown as postgres.JSONValue)},now())
      ON CONFLICT (provider,query_key) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=now()`;
  }
}

/** Fixed-window counter shared by all instances. Returns true when the caller is over `max` for the current window. */
export async function rateLimited(
  sql: postgres.Sql,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const start = Math.floor(now / windowMs) * windowMs;
  const r =
    await sql`INSERT INTO media_rate_counters(key,window_start,n) VALUES(${key.slice(0, 200)},to_timestamp(${start / 1000}),1)
    ON CONFLICT (key,window_start) DO UPDATE SET n=media_rate_counters.n+1 RETURNING n`;
  // old windows are swept opportunistically so the table stays small
  if (Math.random() < 0.01)
    await sql`DELETE FROM media_rate_counters WHERE window_start < now() - interval '2 days'`;
  return Number(r[0]!.n) > max;
}

/** True the first time an organisation selects a picture; false for every repeat, on any instance. */
export async function claimSelection(
  sql: postgres.Sql,
  orgId: string,
  provider: string,
  imageId: string,
  userId: string,
): Promise<boolean> {
  const r =
    await sql`INSERT INTO media_selections(org_id,provider,image_id,selected_by) VALUES(${orgId},${provider},${imageId},${userId}) ON CONFLICT DO NOTHING RETURNING 1`;
  return r.length > 0;
}
export async function releaseSelection(
  sql: postgres.Sql,
  orgId: string,
  provider: string,
  imageId: string,
): Promise<void> {
  await sql`DELETE FROM media_selections WHERE org_id=${orgId} AND provider=${provider} AND image_id=${imageId}`;
}
