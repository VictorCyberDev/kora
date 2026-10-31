import type postgres from "postgres";
import type {
  AgentAction,
  Evidence,
  GrowthBrief,
  BriefNumbers,
  Recommendation,
} from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export interface RecommendationRecord {
  id: string;
  status: "OPEN" | "ACCEPTED" | "DISMISSED" | "RESOLVED";
  rec: Omit<Recommendation, "evidence">;
  evidence: Evidence[];
  result: unknown;
  firstSeenAt: string | null;
  decidedAt: string | null;
}

export class MarketingStore {
  constructor(private readonly sql: postgres.Sql) {}
  private tx<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    return this.sql.begin((t) =>
      fn(t as unknown as postgres.Sql),
    ) as Promise<T>;
  }

  /**
   * Reconciles the current recommendations with what is stored: new ones open, unchanged ones refresh, ones that no
   * longer apply resolve, and a dismissed one stays quiet until its snooze ends.
   */
  async reconcile(
    siteId: string,
    orgId: string,
    recs: Recommendation[],
    now: Date,
  ) {
    await this.tx(async (sql) => {
      const existing =
        await sql`SELECT * FROM marketing_recommendations WHERE site_id=${siteId} FOR UPDATE`;
      const byKey = new Map(existing.map((r) => [String(r.dedupe_key), r]));
      const keys = new Set(recs.map((r) => r.key));
      for (const r of recs) {
        const { evidence, ...rest } = r;
        const cur = byKey.get(r.key);
        let id: string;
        if (!cur) {
          id = crypto.randomUUID();
          await sql`INSERT INTO marketing_recommendations(id,site_id,org_id,dedupe_key,rule,payload) VALUES(${id},${siteId},${orgId},${r.key},${r.rule},${sql.json(rest as never)})`;
        } else {
          id = String(cur.id);
          const status = String(cur.status);
          const until = cur.dismissed_until
            ? new Date(cur.dismissed_until as string)
            : null;
          const snoozed =
            status === "DISMISSED" && until !== null && until > now;
          if (snoozed || status === "ACCEPTED") {
            await sql`UPDATE marketing_recommendations SET last_seen_at=${now.toISOString()} WHERE id=${id}`;
            continue;
          }
          await sql`UPDATE marketing_recommendations SET payload=${sql.json(rest as never)},status='OPEN',last_seen_at=${now.toISOString()},dismissed_until=NULL WHERE id=${id}`;
        }
        await sql`DELETE FROM recommendation_evidence WHERE recommendation_id=${id}`;
        for (const e of evidence)
          await sql`INSERT INTO recommendation_evidence(id,recommendation_id,site_id,label,value,source) VALUES(${crypto.randomUUID()},${id},${siteId},${e.label},${e.value},${e.source})`;
      }
      for (const [k, r] of byKey)
        if (!keys.has(k) && (r.status === "OPEN" || r.status === "ACCEPTED"))
          await sql`UPDATE marketing_recommendations SET status='RESOLVED' WHERE id=${String(r.id)}`;
    });
  }
  async list(
    siteId: string,
    statuses: string[] = ["OPEN"],
  ): Promise<RecommendationRecord[]> {
    const rows = await this
      .sql`SELECT * FROM marketing_recommendations WHERE site_id=${siteId} AND status = ANY(${statuses}) ORDER BY (payload->>'priority')::int DESC, first_seen_at`;
    const ev = await this
      .sql`SELECT recommendation_id,label,value,source FROM recommendation_evidence WHERE site_id=${siteId}`;
    return rows.map((r: Row) => ({
      id: String(r.id),
      status: r.status as RecommendationRecord["status"],
      rec: r.payload as RecommendationRecord["rec"],
      evidence: ev
        .filter((e) => String(e.recommendation_id) === String(r.id))
        .map((e) => ({
          label: String(e.label),
          value: String(e.value),
          source: String(e.source),
        })),
      result: r.result ?? null,
      firstSeenAt: iso(r.first_seen_at),
      decidedAt: iso(r.decided_at),
    }));
  }
  async get(siteId: string, id: string) {
    return (
      (
        await this.list(siteId, ["OPEN", "ACCEPTED", "DISMISSED", "RESOLVED"])
      ).find((r) => r.id === id) ?? null
    );
  }
  async decide(
    siteId: string,
    id: string,
    status: "ACCEPTED" | "DISMISSED",
    userId: string,
    result: unknown,
    snoozeDays = 7,
  ) {
    const r = await this
      .sql`UPDATE marketing_recommendations SET status=${status},decided_by=${userId},decided_at=now(),result=${this.sql.json((result ?? null) as never)},
      dismissed_until=${status === "DISMISSED" ? new Date(Date.now() + snoozeDays * 86_400_000).toISOString() : null}
      WHERE site_id=${siteId} AND id=${id} AND status='OPEN' RETURNING id`;
    return r.length > 0;
  }

  // ---- briefs -----------------------------------------------------------
  async saveBrief(i: {
    siteId: string;
    orgId: string;
    numbers: BriefNumbers;
    brief: GrowthBrief;
    userId: string;
  }) {
    const r = await this
      .sql`INSERT INTO growth_briefs(id,site_id,org_id,period_start,period_end,numbers,brief,created_by)
      VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.brief.period.start},${i.brief.period.end},${this.sql.json(i.numbers as never)},${this.sql.json(i.brief as never)},${i.userId})
      ON CONFLICT (site_id, period_start, period_end) DO NOTHING RETURNING id`;
    return r.length > 0;
  }
  async briefs(siteId: string) {
    return (
      await this
        .sql`SELECT id,brief,created_at FROM growth_briefs WHERE site_id=${siteId} ORDER BY period_end DESC LIMIT 12`
    ).map((r) => ({
      id: String(r.id),
      brief: r.brief as GrowthBrief,
      createdAt: iso(r.created_at),
    }));
  }
  async briefFor(siteId: string, start: string, end: string) {
    const r = (
      await this
        .sql`SELECT brief FROM growth_briefs WHERE site_id=${siteId} AND period_start=${start} AND period_end=${end}`
    )[0];
    return r ? (r.brief as GrowthBrief) : null;
  }
  async numbers(siteId: string, start: Date, end: Date, prevStart: Date) {
    const leads = (
      await this
        .sql`SELECT COUNT(*) FILTER (WHERE created_at >= ${start.toISOString()} AND created_at < ${end.toISOString()})::int AS cur,
        COUNT(*) FILTER (WHERE created_at >= ${prevStart.toISOString()} AND created_at < ${start.toISOString()})::int AS prev FROM leads WHERE site_id=${siteId}`
    )[0]!;
    const posts = await this
      .sql`SELECT provider,state,COUNT(*)::int AS n FROM publish_jobs WHERE site_id=${siteId} AND updated_at >= ${start.toISOString()} AND updated_at < ${end.toISOString()} AND state IN ('PUBLISHED','FAILED') GROUP BY provider,state`;
    const byChannel: Record<string, number> = {};
    let published = 0,
      failed = 0;
    for (const p of posts) {
      if (p.state === "PUBLISHED") {
        published += Number(p.n);
        byChannel[String(p.provider)] = Number(p.n);
      } else failed += Number(p.n);
    }
    const issues = (
      await this
        .sql`SELECT COUNT(*)::int AS open, COUNT(*) FILTER (WHERE status='FAIL')::int AS failing FROM presence_issues WHERE site_id=${siteId} AND resolved_at IS NULL`
    )[0]!;
    const hasProfile =
      (
        await this
          .sql`SELECT 1 FROM presence_checks WHERE site_id=${siteId} LIMIT 1`
      ).length > 0;
    return {
      enquiries: { current: Number(leads.cur), previous: Number(leads.prev) },
      posts: { published, failed, byChannel },
      presence: hasProfile
        ? { open: Number(issues.open), failing: Number(issues.failing) }
        : null,
    };
  }

  // ---- campaigns --------------------------------------------------------
  async createCampaign(i: {
    siteId: string;
    orgId: string;
    name: string;
    objective: string;
    offerId: string;
    offerTitle: string;
    startsOn: string;
    endsOn: string;
    brandVersion: number;
    userId: string;
    channels: Array<{ provider: string; assetId: string }>;
  }) {
    return this.tx(async (sql) => {
      const id = crypto.randomUUID();
      await sql`INSERT INTO campaigns(id,site_id,org_id,name,objective,offer_id,offer_title,starts_on,ends_on,brand_version,created_by) VALUES(${id},${i.siteId},${i.orgId},${i.name},${i.objective},${i.offerId},${i.offerTitle},${i.startsOn},${i.endsOn},${i.brandVersion},${i.userId})`;
      for (const c of i.channels)
        await sql`INSERT INTO campaign_channels(campaign_id,site_id,provider,asset_id) VALUES(${id},${i.siteId},${c.provider},${c.assetId})`;
      return id;
    });
  }
  async campaigns(siteId: string) {
    return (
      await this
        .sql`SELECT c.*, (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id) AS items,
        (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id AND i.state='PUBLISHED') AS published,
        (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id AND i.state='APPROVAL_NEEDED') AS needs_approval,
        (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id AND i.state IN ('FAILED','PARTIALLY_PUBLISHED')) AS problems
        FROM campaigns c WHERE c.site_id=${siteId} ORDER BY c.created_at DESC LIMIT 50`
    ).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      objective: String(r.objective),
      offerId: String(r.offer_id),
      offerTitle: String(r.offer_title),
      startsOn: String(r.starts_on).slice(0, 10),
      endsOn: String(r.ends_on).slice(0, 10),
      status: String(r.status),
      brandVersion: Number(r.brand_version),
      items: Number(r.items),
      published: Number(r.published),
      needsApproval: Number(r.needs_approval),
      problems: Number(r.problems),
    }));
  }
  async campaignItems(siteId: string, campaignId: string) {
    return (
      await this
        .sql`SELECT id FROM calendar_items WHERE site_id=${siteId} AND campaign_id=${campaignId} ORDER BY scheduled_for`
    ).map((r) => String(r.id));
  }
  async setCampaignStatus(siteId: string, id: string, status: string) {
    return (
      (
        await this
          .sql`UPDATE campaigns SET status=${status},updated_at=now() WHERE site_id=${siteId} AND id=${id} RETURNING id`
      ).length > 0
    );
  }
}
export type { AgentAction };
