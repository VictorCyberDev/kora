import { createHash } from "node:crypto";
import type postgres from "postgres";
import type { ContentChannel, ContentDraft, DraftIssue } from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export interface DraftRecord {
  id: string;
  channel: ContentChannel;
  goal: string;
  draft: ContentDraft;
  issues: DraftIssue[];
  source: string;
  status: string;
  brandVersion: number | null;
  createdAt: string | null;
}
const mapDraft = (r: Row): DraftRecord => ({
  id: String(r.id),
  channel: r.channel as ContentChannel,
  goal: String(r.goal),
  draft: r.payload as ContentDraft,
  issues: r.issues as DraftIssue[],
  source: String(r.source),
  status: String(r.status),
  brandVersion: r.brand_version === null ? null : Number(r.brand_version),
  createdAt: iso(r.created_at),
});
export interface AssetMeta {
  id: string;
  kind: "IMAGE" | "VIDEO";
  format: string;
  category: string | null;
  brandVersion: number;
  mime: string;
  width: number;
  height: number;
  durationMs: number | null;
  spec: unknown;
  createdAt: string | null;
}
const META =
  "id,kind,format,category,brand_version,mime,width,height,duration_ms,spec,created_at";
const mapAsset = (r: Row): AssetMeta => ({
  id: String(r.id),
  kind: r.kind as "IMAGE" | "VIDEO",
  format: String(r.format),
  category: (r.category as string | null) ?? null,
  brandVersion: Number(r.brand_version),
  mime: String(r.mime),
  width: Number(r.width),
  height: Number(r.height),
  durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
  spec: r.spec,
  createdAt: iso(r.created_at),
});
export interface RenderJob {
  id: string;
  siteId: string;
  orgId: string;
  spec: unknown;
  brandVersion: number;
  businessName: string;
  status: "QUEUED" | "RENDERING" | "READY" | "FAILED";
  attempts: number;
  error: string | null;
  assetId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
const mapJob = (r: Row): RenderJob => ({
  id: String(r.id),
  siteId: String(r.site_id),
  orgId: String(r.org_id),
  spec: r.spec,
  brandVersion: Number(r.brand_version),
  businessName: String(r.business_name),
  status: r.status as RenderJob["status"],
  attempts: Number(r.attempts),
  error: (r.error as string | null) ?? null,
  assetId: (r.asset_id as string | null) ?? null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const MAX_ATTEMPTS = 3;

export class StudioStore {
  constructor(private readonly sql: postgres.Sql) {}

  async saveDrafts(i: {
    siteId: string;
    orgId: string;
    channel: ContentChannel;
    goal: string;
    source: string;
    profileRevision: number | null;
    brandVersion: number | null;
    userId: string;
    drafts: Array<{ draft: ContentDraft; issues: DraftIssue[] }>;
  }) {
    const out: DraftRecord[] = [];
    for (const d of i.drafts) {
      const r = (
        await this
          .sql`INSERT INTO content_drafts(id,site_id,org_id,channel,goal,payload,issues,source,profile_revision,brand_version,created_by)
          VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.channel},${i.goal},${this.sql.json(d.draft)},${this.sql.json(d.issues as unknown as postgres.JSONValue)},${i.source},${i.profileRevision},${i.brandVersion},${i.userId}) RETURNING *`
      )[0]!;
      out.push(mapDraft(r));
    }
    return out;
  }
  async listDrafts(siteId: string) {
    return (
      await this
        .sql`SELECT * FROM content_drafts WHERE site_id=${siteId} AND status='DRAFT' ORDER BY created_at DESC LIMIT 100`
    ).map(mapDraft);
  }
  async getDraft(siteId: string, id: string) {
    const r = (
      await this
        .sql`SELECT * FROM content_drafts WHERE site_id=${siteId} AND id=${id}`
    )[0];
    return r ? mapDraft(r) : null;
  }
  async updateDraft(
    siteId: string,
    id: string,
    draft: ContentDraft,
    issues: DraftIssue[],
  ) {
    const r = (
      await this
        .sql`UPDATE content_drafts SET payload=${this.sql.json(draft)},issues=${this.sql.json(issues as unknown as postgres.JSONValue)},source='owner',updated_at=now() WHERE site_id=${siteId} AND id=${id} AND status='DRAFT' RETURNING *`
    )[0];
    return r ? mapDraft(r) : null;
  }
  async discardDraft(siteId: string, id: string) {
    return (
      (
        await this
          .sql`UPDATE content_drafts SET status='DISCARDED',updated_at=now() WHERE site_id=${siteId} AND id=${id} AND status='DRAFT' RETURNING id`
      ).length > 0
    );
  }

  async saveAsset(i: {
    siteId: string;
    orgId: string;
    kind: "IMAGE" | "VIDEO";
    format: string;
    category: string | null;
    spec: unknown;
    brandVersion: number;
    mime: string;
    bytes: Buffer;
    svg: string | null;
    width: number;
    height: number;
    durationMs?: number | null;
    userId: string | null;
  }) {
    const r = (
      await this
        .sql`INSERT INTO media_assets(id,site_id,org_id,kind,format,category,spec,brand_version,mime,bytes,svg,sha256,width,height,duration_ms,created_by)
        VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.kind},${i.format},${i.category},${this.sql.json(i.spec as postgres.JSONValue)},${i.brandVersion},${i.mime},${i.bytes},${i.svg},${createHash("sha256").update(i.bytes).digest("hex")},${i.width},${i.height},${i.durationMs ?? null},${i.userId}) RETURNING ${this.sql.unsafe(META)}`
    )[0]!;
    return mapAsset(r);
  }
  async listAssets(siteId: string) {
    return (
      await this
        .sql`SELECT ${this.sql.unsafe(META)} FROM media_assets WHERE site_id=${siteId} ORDER BY created_at DESC LIMIT 100`
    ).map(mapAsset);
  }
  async assetFile(siteId: string, id: string, variant: "primary" | "svg") {
    const r = (
      await this
        .sql`SELECT mime,bytes,svg FROM media_assets WHERE site_id=${siteId} AND id=${id}`
    )[0];
    if (!r) return null;
    if (variant === "svg")
      return r.svg
        ? { mime: "image/svg+xml", bytes: Buffer.from(String(r.svg)) }
        : null;
    return { mime: String(r.mime), bytes: r.bytes as Buffer };
  }

  // ---- render jobs ------------------------------------------------------
  async enqueue(i: {
    siteId: string;
    orgId: string;
    spec: unknown;
    brandVersion: number;
    businessName: string;
    userId: string;
  }) {
    const r = (
      await this
        .sql`INSERT INTO motion_renders(id,site_id,org_id,spec,brand_version,business_name,created_by) VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${this.sql.json(i.spec as postgres.JSONValue)},${i.brandVersion},${i.businessName},${i.userId}) RETURNING *`
    )[0]!;
    return mapJob(r);
  }
  async listJobs(siteId: string) {
    return (
      await this
        .sql`SELECT * FROM motion_renders WHERE site_id=${siteId} ORDER BY created_at DESC LIMIT 50`
    ).map(mapJob);
  }
  async getJob(siteId: string, id: string) {
    const r = (
      await this
        .sql`SELECT * FROM motion_renders WHERE site_id=${siteId} AND id=${id}`
    )[0];
    return r ? mapJob(r) : null;
  }
  /** Only a FAILED render can be retried; rendering is deterministic and has no external effects, so retry is always safe. */
  async retry(siteId: string, id: string) {
    return (
      (
        await this
          .sql`UPDATE motion_renders SET status='QUEUED',attempts=0,error=NULL,updated_at=now() WHERE site_id=${siteId} AND id=${id} AND status='FAILED' RETURNING id`
      ).length > 0
    );
  }
  /** Claims one job. Jobs stuck in RENDERING for 5+ minutes (a crashed worker) become claimable again. */
  async claim(): Promise<RenderJob | null> {
    await this
      .sql`UPDATE motion_renders SET status='FAILED',error='Rendering did not finish after several attempts.',updated_at=now() WHERE status='RENDERING' AND started_at < now() - interval '5 minutes' AND attempts >= ${MAX_ATTEMPTS}`;
    const r = (
      await this
        .sql`UPDATE motion_renders SET status='RENDERING',attempts=attempts+1,started_at=now(),updated_at=now()
        WHERE id = (SELECT id FROM motion_renders WHERE (status='QUEUED' OR (status='RENDERING' AND started_at < now() - interval '5 minutes')) AND attempts < ${MAX_ATTEMPTS} ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`
    )[0];
    return r ? mapJob(r) : null;
  }
  async finish(id: string, assetId: string) {
    await this
      .sql`UPDATE motion_renders SET status='READY',asset_id=${assetId},error=NULL,updated_at=now() WHERE id=${id}`;
  }
  async fail(id: string, attempts: number, message: string) {
    await this
      .sql`UPDATE motion_renders SET status=${attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED"},error=${message.slice(0, 300)},updated_at=now() WHERE id=${id}`;
  }
}
