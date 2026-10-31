import type postgres from "postgres";
import {
  newTrackCode,
  type LinkResult,
  type MemoryEntry,
  type NormalizedRow,
  type ChannelProvider,
} from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export class IntelStore {
  constructor(private readonly sql: postgres.Sql) {}

  // ---- attribution ------------------------------------------------------
  async linkFor(i: {
    siteId: string;
    orgId: string;
    provider: string;
    campaignId?: string | null;
    itemId?: string | null;
    label?: string;
  }): Promise<string> {
    const existing = i.campaignId
      ? (
          await this
            .sql`SELECT code FROM attribution_links WHERE campaign_id=${i.campaignId} AND provider=${i.provider}`
        )[0]
      : i.itemId
        ? (
            await this
              .sql`SELECT code FROM attribution_links WHERE item_id=${i.itemId} AND provider=${i.provider} AND campaign_id IS NULL`
          )[0]
        : null;
    if (existing) return String(existing.code);
    for (let n = 0; n < 5; n++) {
      const code = newTrackCode();
      const r = await this
        .sql`INSERT INTO attribution_links(code,site_id,org_id,provider,campaign_id,item_id,label) VALUES(${code},${i.siteId},${i.orgId},${i.provider},${i.campaignId ?? null},${i.itemId ?? null},${i.label ?? ""}) ON CONFLICT DO NOTHING RETURNING code`;
      if (r[0]) return code;
      const again = i.campaignId
        ? (
            await this
              .sql`SELECT code FROM attribution_links WHERE campaign_id=${i.campaignId} AND provider=${i.provider}`
          )[0]
        : i.itemId
          ? (
              await this
                .sql`SELECT code FROM attribution_links WHERE item_id=${i.itemId} AND provider=${i.provider} AND campaign_id IS NULL`
            )[0]
          : null;
      if (again) return String(again.code);
    }
    throw new Error("could not allocate a tracking code");
  }
  async siteOfCode(code: string): Promise<string | null> {
    const r = (
      await this.sql`SELECT site_id FROM attribution_links WHERE code=${code}`
    )[0];
    return r ? String(r.site_id) : null;
  }
  async record(
    code: string,
    siteId: string,
    kind: "VISIT" | "WHATSAPP_TAP" | "CALL_TAP",
  ) {
    await this
      .sql`INSERT INTO attribution_events(id,code,site_id,kind) VALUES(${crypto.randomUUID()},${code},${siteId},${kind})`;
  }
  async results(
    siteId: string,
    since: Date,
    until: Date,
    campaignId?: string,
  ): Promise<LinkResult[]> {
    const rows = await this.sql`SELECT l.code,l.provider,l.campaign_id,l.label,
        COUNT(e.id) FILTER (WHERE e.kind='VISIT' AND e.occurred_at >= ${since.toISOString()} AND e.occurred_at < ${until.toISOString()})::int AS visits,
        COUNT(e.id) FILTER (WHERE e.kind='WHATSAPP_TAP' AND e.occurred_at >= ${since.toISOString()} AND e.occurred_at < ${until.toISOString()})::int AS wa,
        COUNT(e.id) FILTER (WHERE e.kind='CALL_TAP' AND e.occurred_at >= ${since.toISOString()} AND e.occurred_at < ${until.toISOString()})::int AS calls,
        (SELECT COUNT(*)::int FROM form_submissions f WHERE f.site_id=l.site_id AND f.fields->>'k'=l.code AND f.submitted_at >= ${since.toISOString()} AND f.submitted_at < ${until.toISOString()}) AS enq
      FROM attribution_links l LEFT JOIN attribution_events e ON e.code=l.code
      WHERE l.site_id=${siteId} ${campaignId ? this.sql`AND l.campaign_id=${campaignId}` : this.sql``} GROUP BY l.code,l.provider,l.campaign_id,l.label,l.site_id`;
    return rows.map((r: Row) => ({
      code: String(r.code),
      provider: String(r.provider),
      campaignId: (r.campaign_id as string | null) ?? null,
      label: String(r.label),
      visits: Number(r.visits),
      whatsappTaps: Number(r.wa),
      callTaps: Number(r.calls),
      enquiries: Number(r.enq),
    }));
  }

  // ---- analytics --------------------------------------------------------
  async saveMetrics(i: {
    siteId: string;
    orgId: string;
    provider: ChannelProvider;
    mode: "LIVE" | "SANDBOX";
    rows: NormalizedRow[];
  }) {
    let n = 0;
    for (const r of i.rows) {
      const x = await this
        .sql`INSERT INTO social_metrics(id,site_id,org_id,provider,mode,scope,external_id,raw_name,metric,value,period_end,raw)
        VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.provider},${i.mode},${r.scope},${r.externalId},${r.name},${r.metric},${r.value},${r.periodEnd},${this.sql.json({ name: r.name, value: r.value })})
        ON CONFLICT (site_id,provider,scope,external_id,raw_name,period_end) DO UPDATE SET value=EXCLUDED.value,metric=EXCLUDED.metric,mode=EXCLUDED.mode,fetched_at=now() RETURNING id`;
      n += x.length;
    }
    return n;
  }
  async metrics(siteId: string, since: string) {
    return (
      await this
        .sql`SELECT provider,mode,scope,external_id,raw_name,metric,value,to_char(period_end,'YYYY-MM-DD') AS period_s FROM social_metrics WHERE site_id=${siteId} AND period_end >= ${since} ORDER BY period_end`
    ).map((r) => ({
      provider: String(r.provider) as ChannelProvider,
      mode: String(r.mode) as "LIVE" | "SANDBOX",
      scope: String(r.scope) as "ACCOUNT" | "POST",
      externalId: String(r.external_id),
      name: String(r.raw_name),
      metric: String(r.metric) as NormalizedRow["metric"],
      value: Number(r.value),
      periodEnd: String(r.period_s),
    }));
  }

  // ---- reviews ----------------------------------------------------------
  async upsertReview(i: {
    siteId: string;
    orgId: string;
    provider: string;
    mode: "LIVE" | "SANDBOX" | "MANUAL";
    externalId: string;
    rating: number;
    author: string;
    body: string;
    reviewedAt: string;
    sensitive: boolean;
  }) {
    const r = await this
      .sql`INSERT INTO reviews(id,site_id,org_id,provider,mode,external_id,rating,author,body,reviewed_at,sensitive)
      VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.provider},${i.mode},${i.externalId},${i.rating},${i.author},${i.body},${i.reviewedAt},${i.sensitive})
      ON CONFLICT (site_id,provider,external_id) DO NOTHING RETURNING id`;
    return r[0] ? String(r[0].id) : null;
  }
  async reviews(siteId: string) {
    const rows = await this
      .sql`SELECT * FROM reviews WHERE site_id=${siteId} ORDER BY reviewed_at DESC LIMIT 200`;
    const replies = await this
      .sql`SELECT id,review_id,body,origin,state,created_at FROM review_replies WHERE site_id=${siteId} ORDER BY created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      provider: String(r.provider),
      mode: String(r.mode),
      rating: Number(r.rating),
      author: String(r.author),
      body: String(r.body),
      reviewedAt: iso(r.reviewed_at),
      sensitive: Boolean(r.sensitive),
      status: String(r.status),
      replies: replies
        .filter((p) => String(p.review_id) === String(r.id))
        .map((p) => ({
          id: String(p.id),
          body: String(p.body),
          origin: String(p.origin),
          state: String(p.state),
          createdAt: iso(p.created_at),
        })),
    }));
  }
  async review(siteId: string, id: string) {
    return (await this.reviews(siteId)).find((r) => r.id === id) ?? null;
  }
  async setReviewStatus(
    siteId: string,
    id: string,
    status: "SEEN" | "REPLIED" | "DISMISSED",
  ) {
    return (
      (
        await this
          .sql`UPDATE reviews SET status=${status} WHERE site_id=${siteId} AND id=${id} RETURNING id`
      ).length > 0
    );
  }
  async addReply(i: {
    siteId: string;
    orgId: string;
    reviewId: string;
    body: string;
    origin: "SUGGESTED" | "OWNER";
    userId: string;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO review_replies(id,review_id,site_id,org_id,body,origin,created_by) VALUES(${id},${i.reviewId},${i.siteId},${i.orgId},${i.body},${i.origin},${i.userId})`;
    return id;
  }

  // ---- memory -----------------------------------------------------------
  async memory(siteId: string) {
    return (
      await this
        .sql`SELECT id,kind,key,value,source,evidence,created_at FROM business_memory WHERE site_id=${siteId} AND archived_at IS NULL ORDER BY created_at DESC LIMIT 200`
    ).map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as MemoryEntry["kind"],
      key: String(r.key),
      value: String(r.value),
      source: String(r.source),
      evidence: r.evidence as Record<string, unknown>,
      createdAt: iso(r.created_at),
    }));
  }
  async addMemory(i: {
    siteId: string;
    orgId: string;
    kind: string;
    key: string;
    value: string;
    source: "OWNER" | "SYSTEM";
    evidence?: unknown;
    userId: string | null;
  }) {
    const r = await this
      .sql`INSERT INTO business_memory(id,site_id,org_id,kind,key,value,source,evidence,created_by) VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.kind},${i.key},${i.value},${i.source},${this.sql.json((i.evidence ?? {}) as never)},${i.userId})
      ON CONFLICT (site_id,key) WHERE kind='OUTCOME' DO NOTHING RETURNING id`;
    return r[0] ? String(r[0].id) : null;
  }
  async archiveMemory(siteId: string, id: string) {
    return (
      (
        await this
          .sql`UPDATE business_memory SET archived_at=now() WHERE site_id=${siteId} AND id=${id} AND archived_at IS NULL RETURNING id`
      ).length > 0
    );
  }
  async endedCampaignsWithoutOutcome(siteId: string, today: string) {
    return (
      await this
        .sql`SELECT c.id,c.name,c.offer_title,to_char(c.ends_on,'YYYY-MM-DD') AS ends_s,to_char(c.starts_on,'YYYY-MM-DD') AS starts_s,
        (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id AND i.state <> 'CANCELLED') AS planned,
        (SELECT COUNT(*)::int FROM calendar_items i WHERE i.campaign_id=c.id AND i.state='PUBLISHED') AS published,
        (SELECT COALESCE(array_agg(DISTINCT provider),'{}') FROM campaign_channels cc WHERE cc.campaign_id=c.id) AS channels,
        c.id AS cid
      FROM campaigns c WHERE c.site_id=${siteId} AND c.status IN ('ACTIVE','COMPLETED') AND c.ends_on < ${today}
        AND NOT EXISTS (SELECT 1 FROM business_memory m WHERE m.site_id=c.site_id AND m.key='campaign:'||c.id::text AND m.kind='OUTCOME')`
    ).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      offerTitle: String(r.offer_title),
      endsOn: String(r.ends_s),
      startsOn: String(r.starts_s),
      planned: Number(r.planned),
      published: Number(r.published),
      channels: r.channels as string[],
    }));
  }
}
