import type postgres from "postgres";
import {
  nextItemState,
  type Caption,
  type FailureClass,
  type ItemEvent,
  type ItemState,
  type JobState,
  type PolicyDecision,
} from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export interface ItemRecord {
  id: string;
  siteId: string;
  orgId: string;
  campaignId: string | null;
  title: string;
  caption: Caption;
  assetId: string | null;
  channels: string[];
  scheduledFor: string | null;
  state: ItemState;
  approvedHash: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
const mapItem = (r: Row): ItemRecord => ({
  id: String(r.id),
  siteId: String(r.site_id),
  orgId: String(r.org_id),
  campaignId: (r.campaign_id as string | null) ?? null,
  title: String(r.title),
  caption: r.caption as Caption,
  assetId: (r.asset_id as string | null) ?? null,
  channels: (r.channels as string[]) ?? [],
  scheduledFor: iso(r.scheduled_for),
  state: r.state as ItemState,
  approvedHash: (r.approved_hash as string | null) ?? null,
  approvedAt: iso(r.approved_at),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export interface JobRecord {
  id: string;
  itemId: string;
  siteId: string;
  orgId: string;
  provider: string;
  state: JobState;
  contentHash: string;
  dueAt: string | null;
  nextAttemptAt: string | null;
  attempts: number;
  method: string | null;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  errorClass: FailureClass | null;
  idempotencyKey: string;
}
const mapJob = (r: Row): JobRecord => ({
  id: String(r.id),
  itemId: String(r.item_id),
  siteId: String(r.site_id),
  orgId: String(r.org_id),
  provider: String(r.provider),
  state: r.state as JobState,
  contentHash: String(r.content_hash),
  dueAt: iso(r.due_at),
  nextAttemptAt: iso(r.next_attempt_at),
  attempts: Number(r.attempts),
  method: (r.method as string | null) ?? null,
  externalId: (r.external_id as string | null) ?? null,
  externalUrl: (r.external_url as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  errorClass: (r.error_class as FailureClass | null) ?? null,
  idempotencyKey: String(r.idempotency_key),
});

export class CalendarStore {
  constructor(private readonly sql: postgres.Sql) {}
  private tx<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    return this.sql.begin((t) =>
      fn(t as unknown as postgres.Sql),
    ) as Promise<T>;
  }

  async create(i: {
    siteId: string;
    orgId: string;
    title: string;
    caption: Caption;
    assetId: string | null;
    channels: string[];
    scheduledFor: string | null;
    campaignId?: string | null;
    state: ItemState;
    userId: string | null;
  }) {
    const r = (
      await this
        .sql`INSERT INTO calendar_items(id,site_id,org_id,campaign_id,title,caption,asset_id,channels,scheduled_for,state,created_by)
        VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.campaignId ?? null},${i.title},${this.sql.json(i.caption)},${i.assetId},${i.channels},${i.scheduledFor},${i.state},${i.userId}) RETURNING *`
    )[0]!;
    return mapItem(r);
  }
  async get(siteId: string, id: string) {
    const r = (
      await this
        .sql`SELECT * FROM calendar_items WHERE site_id=${siteId} AND id=${id}`
    )[0];
    return r ? mapItem(r) : null;
  }
  async list(siteId: string, from: Date, to: Date) {
    return (
      await this
        .sql`SELECT * FROM calendar_items WHERE site_id=${siteId} AND (scheduled_for IS NULL OR (scheduled_for >= ${from.toISOString()} AND scheduled_for < ${to.toISOString()})) AND state <> 'CANCELLED' ORDER BY scheduled_for NULLS FIRST, created_at DESC LIMIT 300`
    ).map(mapItem);
  }

  /** Applies a state-machine event under a row lock. `fn` runs inside the same transaction. */
  async transition<T>(
    siteId: string,
    id: string,
    ev: ItemEvent,
    fn?: (item: ItemRecord, to: ItemState, sql: postgres.Sql) => Promise<T>,
    patch?: {
      caption?: Caption;
      assetId?: string | null;
      channels?: string[];
      scheduledFor?: string | null;
      title?: string;
      approved?: { hash: string; by: string } | null;
    },
  ) {
    return this.tx(async (sql) => {
      const row = (
        await sql`SELECT * FROM calendar_items WHERE site_id=${siteId} AND id=${id} FOR UPDATE`
      )[0];
      if (!row) return null;
      const item = mapItem(row);
      const to = nextItemState(item.state, ev);
      const p = patch ?? {};
      await sql`UPDATE calendar_items SET state=${to},
        caption=${p.caption ? sql.json(p.caption) : sql`caption`},
        asset_id=${p.assetId === undefined ? sql`asset_id` : p.assetId},
        channels=${p.channels ?? item.channels},
        scheduled_for=${p.scheduledFor === undefined ? sql`scheduled_for` : p.scheduledFor},
        title=${p.title ?? item.title},
        approved_hash=${p.approved === undefined ? (ev.type === "edit" ? null : sql`approved_hash`) : (p.approved?.hash ?? null)},
        approved_by=${p.approved === undefined ? (ev.type === "edit" ? null : sql`approved_by`) : (p.approved?.by ?? null)},
        approved_at=${p.approved === undefined ? (ev.type === "edit" ? null : sql`approved_at`) : p.approved ? sql`now()` : null},
        updated_at=now() WHERE id=${id}`;
      if (ev.type === "edit" || ev.type === "cancel")
        await sql`UPDATE publish_jobs SET state='CANCELLED',updated_at=now() WHERE item_id=${id} AND state IN ('QUEUED','FAILED')`;
      const after = mapItem(
        (await sql`SELECT * FROM calendar_items WHERE id=${id}`)[0]!,
      );
      const extra = fn ? await fn(after, to, sql) : (undefined as T);
      return { item: after, from: item.state, to, extra };
    });
  }

  async recordApproval(i: {
    siteId: string;
    orgId: string;
    itemId: string;
    hash: string;
    decision: "APPROVED" | "REJECTED" | "REVOKED";
    userId: string;
    reason?: string;
    policy: PolicyDecision;
  }) {
    await this
      .sql`INSERT INTO approvals(id,site_id,org_id,item_id,content_hash,decision,decided_by,reason,policy) VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.itemId},${i.hash},${i.decision},${i.userId},${i.reason ?? ""},${this.sql.json(i.policy as never)})`;
  }
  async approvals(siteId: string, itemId: string) {
    return (
      await this
        .sql`SELECT decision,content_hash,decided_by,reason,policy,created_at FROM approvals WHERE site_id=${siteId} AND item_id=${itemId} ORDER BY created_at`
    ).map((r) => ({
      decision: String(r.decision),
      contentHash: String(r.content_hash),
      decidedBy: (r.decided_by as string | null) ?? null,
      reason: String(r.reason),
      policy: r.policy as PolicyDecision,
      createdAt: iso(r.created_at),
    }));
  }

  // ---- jobs ---------------------------------------------------------------
  async enqueue(
    sql: postgres.Sql,
    i: {
      itemId: string;
      siteId: string;
      orgId: string;
      providers: string[];
      hash: string;
      dueAt: string;
    },
  ) {
    for (const provider of i.providers) {
      // The key is derived from the approved content: re-scheduling identical content reuses the same job.
      const key = `${i.itemId}:${provider}:${i.hash}`;
      await sql`INSERT INTO publish_jobs(id,item_id,site_id,org_id,provider,idempotency_key,content_hash,due_at,next_attempt_at)
        VALUES(${crypto.randomUUID()},${i.itemId},${i.siteId},${i.orgId},${provider},${key},${i.hash},${i.dueAt},${i.dueAt})
        ON CONFLICT (item_id, provider) DO UPDATE SET state='QUEUED',idempotency_key=${key},content_hash=${i.hash},due_at=${i.dueAt},next_attempt_at=${i.dueAt},attempts=0,error=NULL,error_class=NULL,updated_at=now()
        WHERE publish_jobs.state IN ('FAILED','CANCELLED','QUEUED')`;
    }
  }
  async jobs(siteId: string, itemId: string) {
    return (
      await this
        .sql`SELECT * FROM publish_jobs WHERE site_id=${siteId} AND item_id=${itemId} ORDER BY provider`
    ).map(mapJob);
  }
  async attempts(jobId: string) {
    return (
      await this
        .sql`SELECT attempt,outcome,http_status,detail,started_at,finished_at FROM publish_attempts WHERE job_id=${jobId} ORDER BY attempt`
    ).map((r) => ({
      attempt: Number(r.attempt),
      outcome: String(r.outcome),
      httpStatus: r.http_status === null ? null : Number(r.http_status),
      detail: (r.detail as string | null) ?? null,
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at),
    }));
  }
  /** Recovery: a job whose worker died mid-call may or may not have posted, so it is never retried automatically. */
  async sweepStuck() {
    await this
      .sql`UPDATE publish_attempts SET outcome='FAILED',detail='The server stopped before the provider answered.',finished_at=now() WHERE outcome='STARTED' AND started_at < now() - interval '5 minutes'`;
    await this
      .sql`UPDATE publish_jobs SET state='FAILED',error_class='UNCERTAIN',error='Kora stopped while posting, so the post may or may not be live. Check the channel before trying again.',updated_at=now() WHERE state='PUBLISHING' AND started_at < now() - interval '5 minutes'`;
  }
  async claim(now: Date): Promise<JobRecord | null> {
    return this.tx(async (sql) => {
      const r = (
        await sql`SELECT * FROM publish_jobs WHERE state='QUEUED' AND due_at <= ${now.toISOString()} AND next_attempt_at <= ${now.toISOString()} ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 1`
      )[0];
      if (!r) return null;
      await sql`UPDATE publish_jobs SET state='PUBLISHING',attempts=attempts+1,started_at=now(),updated_at=now() WHERE id=${String(r.id)}`;
      await sql`INSERT INTO publish_attempts(id,job_id,attempt) VALUES(${crypto.randomUUID()},${String(r.id)},${Number(r.attempts) + 1})`;
      return mapJob({
        ...r,
        state: "PUBLISHING",
        attempts: Number(r.attempts) + 1,
      });
    });
  }
  async succeed(
    job: JobRecord,
    r: {
      externalId: string;
      url: string | null;
      method: "LIVE" | "SANDBOX" | "MANUAL";
    },
  ) {
    await this
      .sql`UPDATE publish_jobs SET state='PUBLISHED',external_id=${r.externalId},external_url=${r.url},method=${r.method},error=NULL,error_class=NULL,updated_at=now() WHERE id=${job.id}`;
    await this
      .sql`UPDATE publish_attempts SET outcome='SUCCEEDED',finished_at=now() WHERE job_id=${job.id} AND attempt=${job.attempts}`;
  }
  async fail(
    job: JobRecord,
    f: {
      message: string;
      cls: FailureClass;
      httpStatus?: number;
      retryAt?: Date;
    },
  ) {
    await this
      .sql`UPDATE publish_jobs SET state=${f.retryAt ? "QUEUED" : "FAILED"},error=${f.message.slice(0, 300)},error_class=${f.cls},next_attempt_at=${f.retryAt ? f.retryAt.toISOString() : sql_now(this.sql)},updated_at=now() WHERE id=${job.id}`;
    await this
      .sql`UPDATE publish_attempts SET outcome='FAILED',http_status=${f.httpStatus ?? null},detail=${f.message.slice(0, 300)},finished_at=now() WHERE job_id=${job.id} AND attempt=${job.attempts}`;
  }
  /** Owner-confirmed retry. UNCERTAIN failures require the owner to state the post is not live. */
  async retry(siteId: string, itemId: string, confirmNotPosted: boolean) {
    const jobs = await this.jobs(siteId, itemId);
    const bad = jobs.filter(
      (j) =>
        j.state === "FAILED" &&
        j.errorClass === "UNCERTAIN" &&
        !confirmNotPosted,
    );
    if (bad.length)
      return { ok: false as const, uncertain: bad.map((j) => j.provider) };
    await this
      .sql`UPDATE publish_jobs SET state='QUEUED',attempts=0,next_attempt_at=now(),error=NULL,error_class=NULL,updated_at=now() WHERE site_id=${siteId} AND item_id=${itemId} AND state='FAILED'`;
    return { ok: true as const };
  }
  /** Records that the owner posted this themselves. Creates the job if automatic posting was never possible. */
  async recordManual(i: {
    siteId: string;
    orgId: string;
    itemId: string;
    provider: string;
    hash: string;
    url: string | null;
  }) {
    await this
      .sql`INSERT INTO publish_jobs(id,item_id,site_id,org_id,provider,idempotency_key,content_hash,due_at,state,method,external_url)
      VALUES(${crypto.randomUUID()},${i.itemId},${i.siteId},${i.orgId},${i.provider},${`${i.itemId}:${i.provider}:${i.hash}:manual`},${i.hash},now(),'PUBLISHED','MANUAL',${i.url})
      ON CONFLICT (item_id, provider) DO UPDATE SET state='PUBLISHED',method='MANUAL',external_url=${i.url},error=NULL,error_class=NULL,updated_at=now() WHERE publish_jobs.state <> 'PUBLISHED'`;
  }
  async settled(itemId: string) {
    const r = (
      await this
        .sql`SELECT COUNT(*) FILTER (WHERE state IN ('QUEUED','PUBLISHING'))::int AS open, COUNT(*) FILTER (WHERE state='PUBLISHED')::int AS ok, COUNT(*) FILTER (WHERE state='FAILED')::int AS bad FROM publish_jobs WHERE item_id=${itemId}`
    )[0]!;
    return {
      open: Number(r.open),
      published: Number(r.ok),
      failed: Number(r.bad),
    };
  }
  async stats(siteId: string, since: Date) {
    const r = (
      await this
        .sql`SELECT COUNT(*) FILTER (WHERE state='PUBLISHED')::int AS published, COUNT(*) FILTER (WHERE state='FAILED')::int AS failed, MAX(updated_at) FILTER (WHERE state='PUBLISHED') AS last FROM publish_jobs WHERE site_id=${siteId} AND updated_at >= ${since.toISOString()}`
    )[0]!;
    const last = (
      await this
        .sql`SELECT MAX(updated_at) AS last FROM publish_jobs WHERE site_id=${siteId} AND state='PUBLISHED'`
    )[0]!;
    const sched = (
      await this
        .sql`SELECT COUNT(*)::int AS n FROM calendar_items WHERE site_id=${siteId} AND state IN ('SCHEDULED','APPROVED','APPROVAL_NEEDED')`
    )[0]!;
    return {
      published: Number(r.published),
      failed: Number(r.failed),
      lastPublishedAt: iso(last.last),
      pending: Number(sched.n),
    };
  }
}
function sql_now(sql: postgres.Sql) {
  return sql`now()`;
}
