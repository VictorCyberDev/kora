import type postgres from "postgres";
import type { Role } from "./http.js";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;
const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : (v as string);

export const mapUser = (r: Row) => ({
  id: String(r.id),
  email: String(r.email),
  displayName: String(r.display_name),
});
export const mapSite = (r: Row) => ({
  id: String(r.id),
  orgId: String(r.org_id),
  name: String(r.name),
  slug: String(r.slug),
  description: (r.description as string | null) ?? "",
  status: String(r.status),
  publicUrl: str(r.public_url),
  currentVersionId: str(r.current_version_id),
  publishedVersionId: str(r.published_version_id),
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export const mapVersion = (r: Row, withBodies = false) => ({
  id: String(r.id),
  siteId: String(r.site_id),
  number: Number(r.number),
  state: String(r.state),
  specHash: String(r.spec_hash),
  artifactHash: String(r.artifact_hash),
  generationSource: String(r.generation_source),
  buildStatus: String(r.build_status),
  publishStatus: String(r.publish_status),
  parentVersionId: str(r.parent_version_id),
  createdBy: str(r.created_by),
  createdAt: iso(r.created_at),
  publishedAt: iso(r.published_at),
  ...(withBodies
    ? { spec: r.spec, files: Object.keys(r.artifact as object) }
    : {}),
});

export type AuditEntry = {
  orgId?: string | null;
  actorUserId?: string | null;
  actorKind?: "USER" | "SYSTEM" | "WEBHOOK";
  action: string;
  objectType: string;
  objectId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export class PlatformStore {
  constructor(
    readonly sql: postgres.Sql,
    private readonly inTx = false,
  ) {}
  async inTransaction<T>(fn: (tx: PlatformStore) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    return (await this.sql.begin((tx) =>
      fn(new PlatformStore(tx as unknown as postgres.Sql, true)),
    )) as T;
  }

  // ---- identity -----------------------------------------------------------
  async findUserByEmail(email: string) {
    const r = (
      await this.sql`SELECT * FROM users WHERE lower(email)=lower(${email})`
    )[0];
    return r ? { ...mapUser(r), passwordHash: String(r.password_hash) } : null;
  }
  /** Creates the user, their first organization and an OWNER membership. */
  async signUp(
    email: string,
    passwordHash: string,
    displayName: string,
    orgName: string,
  ) {
    return this.inTransaction(async ({ sql }) => {
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      await sql`INSERT INTO users(id,email,password_hash,display_name) VALUES(${userId},${email},${passwordHash},${displayName})`;
      await sql`INSERT INTO organizations(id,name) VALUES(${orgId},${orgName})`;
      await sql`INSERT INTO organization_memberships(org_id,user_id,role) VALUES(${orgId},${userId},'OWNER')`;
      return { userId, orgId };
    });
  }
  async createSession(userId: string, tokenHash: string, ttlSeconds: number) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(${id},${userId},${tokenHash},now() + ${ttlSeconds} * interval '1 second')`;
    return id;
  }
  async findSession(tokenHash: string) {
    const s = (
      await this
        .sql`SELECT s.id,s.user_id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=${tokenHash} AND s.revoked_at IS NULL AND s.expires_at > now()`
    )[0];
    if (!s) return null;
    const m = await this
      .sql`SELECT org_id,role FROM organization_memberships WHERE user_id=${s.user_id as string}`;
    return {
      userId: String(s.user_id),
      email: String(s.email),
      displayName: String(s.display_name),
      sessionId: String(s.id),
      memberships: new Map(m.map((x) => [String(x.org_id), x.role as Role])),
    };
  }
  async revokeSession(sessionId: string) {
    await this
      .sql`UPDATE sessions SET revoked_at=now() WHERE id=${sessionId} AND revoked_at IS NULL`;
  }
  async revokeAllSessions(userId: string) {
    await this
      .sql`UPDATE sessions SET revoked_at=now() WHERE user_id=${userId} AND revoked_at IS NULL`;
  }
  async listOrgs(userId: string) {
    const rows = await this
      .sql`SELECT o.id,o.name,m.role,o.created_at FROM organizations o JOIN organization_memberships m ON m.org_id=o.id WHERE m.user_id=${userId} ORDER BY o.created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      role: r.role as Role,
      createdAt: iso(r.created_at),
    }));
  }
  async createOrg(userId: string, name: string) {
    return this.inTransaction(async ({ sql }) => {
      const id = crypto.randomUUID();
      await sql`INSERT INTO organizations(id,name) VALUES(${id},${name})`;
      await sql`INSERT INTO organization_memberships(org_id,user_id,role) VALUES(${id},${userId},'OWNER')`;
      return id;
    });
  }
  async listMembers(orgId: string) {
    const rows = await this
      .sql`SELECT u.id,u.email,u.display_name,m.role FROM organization_memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=${orgId} ORDER BY m.created_at`;
    return rows.map((r) => ({
      userId: String(r.id),
      email: String(r.email),
      displayName: String(r.display_name),
      role: r.role as Role,
    }));
  }
  async addMemberByEmail(orgId: string, email: string, role: Role) {
    const u = await this.findUserByEmail(email);
    if (!u) return null;
    await this
      .sql`INSERT INTO organization_memberships(org_id,user_id,role) VALUES(${orgId},${u.id},${role}) ON CONFLICT(org_id,user_id) DO UPDATE SET role=EXCLUDED.role`;
    return u.id;
  }

  // ---- audit --------------------------------------------------------------
  async audit(e: AuditEntry) {
    await this
      .sql`INSERT INTO audit_log(id,org_id,actor_user_id,actor_kind,action,object_type,object_id,request_id,metadata)
      VALUES(${crypto.randomUUID()},${e.orgId ?? null},${e.actorUserId ?? null},${e.actorKind ?? (e.actorUserId ? "USER" : "SYSTEM")},${e.action},${e.objectType},${e.objectId ?? null},${e.requestId ?? null},${this.sql.json((e.metadata ?? {}) as postgres.JSONValue)})`;
  }
  async listAudit(orgId: string, limit = 200) {
    const rows = await this
      .sql`SELECT * FROM audit_log WHERE org_id=${orgId} ORDER BY occurred_at DESC,id LIMIT ${limit}`;
    return rows.map((r) => ({
      id: String(r.id),
      actorUserId: str(r.actor_user_id),
      actorKind: String(r.actor_kind),
      action: String(r.action),
      objectType: String(r.object_type),
      objectId: str(r.object_id),
      requestId: str(r.request_id),
      metadata: r.metadata as Record<string, unknown>,
      occurredAt: iso(r.occurred_at),
    }));
  }

  // ---- sites --------------------------------------------------------------
  async createSite(i: {
    orgId: string;
    name: string;
    slug: string;
    description: string;
    createdBy: string;
  }) {
    const id = crypto.randomUUID();
    const r = (
      await this
        .sql`INSERT INTO sites(id,org_id,name,slug,description,created_by) VALUES(${id},${i.orgId},${i.name},${i.slug},${i.description},${i.createdBy}) RETURNING *`
    )[0]!;
    return mapSite(r);
  }
  async listSites(orgIds: string[]) {
    if (!orgIds.length) return [];
    const rows = await this
      .sql`SELECT * FROM sites WHERE org_id IN ${this.sql(orgIds)} ORDER BY created_at DESC`;
    return rows.map(mapSite);
  }
  async getSite(id: string) {
    const r = (await this.sql`SELECT * FROM sites WHERE id=${id}`)[0];
    return r ? mapSite(r) : null;
  }
  async getSiteBySlug(slug: string) {
    const r = (await this.sql`SELECT * FROM sites WHERE slug=${slug}`)[0];
    return r ? mapSite(r) : null;
  }
  async updateSite(
    id: string,
    patch: { name?: string | undefined; description?: string | undefined },
  ) {
    const r = (
      await this
        .sql`UPDATE sites SET name=COALESCE(${patch.name ?? null},name),description=COALESCE(${patch.description ?? null},description),updated_at=now() WHERE id=${id} RETURNING *`
    )[0];
    return r ? mapSite(r) : null;
  }
  async setSiteStatus(
    id: string,
    status: string,
    extra: {
      publicUrl?: string | null;
      publishedVersionId?: string | null;
    } = {},
  ) {
    await this
      .sql`UPDATE sites SET status=${status},public_url=COALESCE(${extra.publicUrl ?? null},public_url),published_version_id=COALESCE(${extra.publishedVersionId ?? null},published_version_id),updated_at=now() WHERE id=${id}`;
  }
  async listPublishedSites() {
    return (
      await this
        .sql`SELECT * FROM sites WHERE status='PUBLISHED' AND public_url IS NOT NULL`
    ).map(mapSite);
  }

  // ---- versions -----------------------------------------------------------
  async createVersion(i: {
    siteId: string;
    orgId: string;
    spec: unknown;
    specHash: string;
    files: Record<string, string>;
    artifactHash: string;
    source:
      "MODEL" | "DETERMINISTIC" | "EDIT_MODEL" | "EDIT_STRUCTURED" | "MANUAL";
    createdBy: string | null;
    parentId: string | null;
  }) {
    return this.inTransaction(async ({ sql }) => {
      await sql`SELECT id FROM sites WHERE id=${i.siteId} FOR UPDATE`;
      const n = Number(
        (
          await sql`SELECT COALESCE(MAX(number),0)+1 AS n FROM site_versions WHERE site_id=${i.siteId}`
        )[0]!.n,
      );
      const id = crypto.randomUUID();
      const r = (
        await sql`INSERT INTO site_versions(id,site_id,org_id,number,state,spec,spec_hash,artifact_hash,artifact,generation_source,parent_version_id,created_by)
          VALUES(${id},${i.siteId},${i.orgId},${n},'READY',${sql.json(i.spec as postgres.JSONValue)},${i.specHash},${i.artifactHash},${sql.json(i.files)},${i.source},${i.parentId},${i.createdBy}) RETURNING *`
      )[0]!;
      await sql`UPDATE sites SET current_version_id=${id},updated_at=now() WHERE id=${i.siteId}`;
      return mapVersion(r);
    });
  }
  async listVersions(siteId: string) {
    return (
      await this
        .sql`SELECT * FROM site_versions WHERE site_id=${siteId} ORDER BY number DESC`
    ).map((r) => mapVersion(r));
  }
  async getVersionRow(siteId: string, versionId: string) {
    return (
      (
        await this
          .sql`SELECT * FROM site_versions WHERE site_id=${siteId} AND id=${versionId}`
      )[0] ?? null
    );
  }
  async getVersion(siteId: string, versionId: string) {
    const r = await this.getVersionRow(siteId, versionId);
    return r ? mapVersion(r, true) : null;
  }
  async getPublishedVersionRow(siteId: string) {
    return (
      (
        await this
          .sql`SELECT * FROM site_versions WHERE site_id=${siteId} AND state='PUBLISHED'`
      )[0] ?? null
    );
  }
  /** Last version that was published and is no longer current: the rollback target. */
  async getPreviousKnownGood(siteId: string, beforeNumber: number) {
    return (
      (
        await this
          .sql`SELECT * FROM site_versions WHERE site_id=${siteId} AND publish_status='PUBLISHED' AND number < ${beforeNumber} ORDER BY number DESC LIMIT 1`
      )[0] ?? null
    );
  }
  async markVersionPublishing(versionId: string) {
    await this
      .sql`UPDATE site_versions SET publish_status='PUBLISHING' WHERE id=${versionId}`;
  }
  async markVersionPublished(siteId: string, versionId: string) {
    await this.inTransaction(async ({ sql }) => {
      await sql`UPDATE site_versions SET state='SUPERSEDED' WHERE site_id=${siteId} AND state='PUBLISHED' AND id<>${versionId}`;
      await sql`UPDATE site_versions SET state='PUBLISHED',publish_status='PUBLISHED',published_at=now() WHERE id=${versionId}`;
    });
  }
  async markVersionPublishFailed(versionId: string) {
    await this
      .sql`UPDATE site_versions SET publish_status='FAILED' WHERE id=${versionId}`;
  }

  // ---- jobs ---------------------------------------------------------------
  async recordGeneration(i: {
    siteId: string;
    orgId: string;
    kind: "GENERATE" | "EDIT";
    prompt: string;
    status: "SUCCEEDED" | "FAILED";
    source: string;
    versionId?: string | null;
    error?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    createdBy: string | null;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO site_generation_jobs(id,site_id,org_id,kind,prompt,status,source,result_version_id,error,input_tokens,output_tokens,created_by)
      VALUES(${id},${i.siteId},${i.orgId},${i.kind},${i.prompt.slice(0, 4000)},${i.status},${i.source},${i.versionId ?? null},${i.error ?? null},${i.inputTokens ?? null},${i.outputTokens ?? null},${i.createdBy})`;
    return id;
  }
  async startPublishJob(i: {
    siteId: string;
    orgId: string;
    versionId: string;
    publisher: string;
    kind: "PUBLISH" | "REPUBLISH" | "ROLLBACK" | "UNPUBLISH";
    createdBy: string | null;
  }) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO site_publish_jobs(id,site_id,org_id,version_id,publisher,kind,status,created_by) VALUES(${id},${i.siteId},${i.orgId},${i.versionId},${i.publisher},${i.kind},'RUNNING',${i.createdBy})`;
    return id;
  }
  async finishPublishJob(
    id: string,
    status: "SUCCEEDED" | "FAILED",
    detail: Record<string, unknown>,
  ) {
    await this
      .sql`UPDATE site_publish_jobs SET status=${status},detail=${this.sql.json(detail as postgres.JSONValue)},finished_at=now() WHERE id=${id}`;
  }
  async listPublishJobs(siteId: string) {
    return (
      await this
        .sql`SELECT * FROM site_publish_jobs WHERE site_id=${siteId} ORDER BY started_at DESC LIMIT 50`
    ).map((r) => ({
      id: String(r.id),
      versionId: String(r.version_id),
      publisher: String(r.publisher),
      kind: String(r.kind),
      status: String(r.status),
      detail: r.detail as Record<string, unknown>,
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at),
    }));
  }

  // ---- forms --------------------------------------------------------------
  async addSubmission(
    siteId: string,
    orgId: string,
    fields: Record<string, string>,
  ) {
    const id = crypto.randomUUID();
    await this
      .sql`INSERT INTO form_submissions(id,site_id,org_id,fields) VALUES(${id},${siteId},${orgId},${this.sql.json(fields)})`;
    return id;
  }
  async listSubmissions(siteId: string) {
    return (
      await this
        .sql`SELECT * FROM form_submissions WHERE site_id=${siteId} ORDER BY submitted_at DESC LIMIT 500`
    ).map((r) => ({
      id: String(r.id),
      fields: r.fields as Record<string, string>,
      status: String(r.status),
      submittedAt: iso(r.submitted_at),
    }));
  }
  async setSubmissionStatus(
    siteId: string,
    id: string,
    status: "NEW" | "READ" | "ARCHIVED",
  ) {
    const r = await this
      .sql`UPDATE form_submissions SET status=${status} WHERE id=${id} AND site_id=${siteId} RETURNING id`;
    return r.length > 0;
  }

  // ---- notifications & usage ---------------------------------------------
  async notify(n: {
    orgId: string;
    siteId?: string | null;
    kind: string;
    title: string;
    body: string;
    objectType?: string;
    objectId?: string;
    dedupeKey?: string;
  }) {
    await this
      .sql`INSERT INTO notifications(id,org_id,site_id,kind,title,body,object_type,object_id,dedupe_key)
      VALUES(${crypto.randomUUID()},${n.orgId},${n.siteId ?? null},${n.kind},${n.title},${n.body},${n.objectType ?? null},${n.objectId ?? null},${n.dedupeKey ?? null}) ON CONFLICT(dedupe_key) DO NOTHING`;
  }
  async listNotifications(orgIds: string[], limit = 100) {
    if (!orgIds.length) return [];
    return (
      await this
        .sql`SELECT * FROM notifications WHERE org_id IN ${this.sql(orgIds)} ORDER BY created_at DESC LIMIT ${limit}`
    ).map((r) => ({
      id: String(r.id),
      orgId: String(r.org_id),
      siteId: str(r.site_id),
      kind: String(r.kind),
      title: String(r.title),
      body: String(r.body),
      objectType: str(r.object_type),
      objectId: str(r.object_id),
      read: r.read_at !== null,
      createdAt: iso(r.created_at),
    }));
  }
  async markNotificationRead(orgIds: string[], id: string) {
    if (!orgIds.length) return false;
    return (
      (
        await this
          .sql`UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=${id} AND org_id IN ${this.sql(orgIds)} RETURNING id`
      ).length > 0
    );
  }
  async recordUsage(
    orgId: string,
    siteId: string | null,
    dimension: string,
    quantity: number,
    metadata: Record<string, unknown> = {},
  ) {
    await this
      .sql`INSERT INTO usage_events(id,org_id,site_id,dimension,quantity,metadata) VALUES(${crypto.randomUUID()},${orgId},${siteId},${dimension},${quantity},${this.sql.json(metadata as postgres.JSONValue)})`;
  }
  async usageSummary(orgId: string) {
    return (
      await this
        .sql`SELECT dimension,SUM(quantity)::float AS total,COUNT(*)::int AS events FROM usage_events WHERE org_id=${orgId} AND occurred_at > date_trunc('month', now()) GROUP BY dimension ORDER BY dimension`
    ).map((r) => ({
      dimension: String(r.dimension),
      total: Number(r.total),
      events: Number(r.events),
    }));
  }
}
