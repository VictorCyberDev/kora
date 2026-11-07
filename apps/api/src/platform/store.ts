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
  deletedAt: str(r.deleted_at),
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

export class SiteAllowanceError extends Error {
  constructor(
    readonly used: number,
    readonly allowed: number,
  ) {
    super("site_allowance_reached");
    this.name = "SiteAllowanceError";
  }
}

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
    /** When set, the allowance is checked and the row inserted under one per-organisation lock, so two concurrent
     * creations (or a creation racing a deletion) can never both pass a check that only one fits. */
    siteCap?: number;
  }) {
    return this.inTransaction(async (tx) => {
      if (i.siteCap !== undefined) {
        await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`sites:${i.orgId}`}))`;
        const n = Number(
          (
            await tx.sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${i.orgId} AND deleted_at IS NULL`
          )[0]!.n,
        );
        if (n >= i.siteCap) throw new SiteAllowanceError(n, i.siteCap);
      }
      const id = crypto.randomUUID();
      const r = (
        await tx.sql`INSERT INTO sites(id,org_id,name,slug,description,created_by) VALUES(${id},${i.orgId},${i.name},${i.slug},${i.description},${i.createdBy}) RETURNING *`
      )[0]!;
      return mapSite(r);
    });
  }
  async listSites(orgIds: string[]) {
    if (!orgIds.length) return [];
    const rows = await this
      .sql`SELECT * FROM sites WHERE org_id IN ${this.sql(orgIds)} AND deleted_at IS NULL ORDER BY created_at DESC`;
    return rows.map(mapSite);
  }
  /** A site that is live in the account. A deleted site is not found here, so every ordinary route treats it as gone. */
  async getSite(id: string) {
    const r = (
      await this.sql`SELECT * FROM sites WHERE id=${id} AND deleted_at IS NULL`
    )[0];
    return r ? mapSite(r) : null;
  }
  /** Only the deletion path and audit tooling may see a deleted site. */
  async getSiteIncludingDeleted(id: string) {
    const r = (await this.sql`SELECT * FROM sites WHERE id=${id}`)[0];
    return r ? mapSite(r) : null;
  }
  async getSiteBySlug(slug: string) {
    const r = (
      await this
        .sql`SELECT * FROM sites WHERE slug=${slug} AND deleted_at IS NULL`
    )[0];
    return r ? mapSite(r) : null;
  }
  /** What deleting a site would affect, shown to the owner before they confirm. */
  async deletionImpact(siteId: string) {
    const n = async (q: Promise<postgres.Row[]>) => Number((await q)[0]!.n);
    return {
      versions: await n(
        this
          .sql`SELECT COUNT(*)::int AS n FROM site_versions WHERE site_id=${siteId}`,
      ),
      enquiries: await n(
        this
          .sql`SELECT COUNT(*)::int AS n FROM form_submissions WHERE site_id=${siteId}`,
      ),
      customDomains: await n(
        this
          .sql`SELECT COUNT(*)::int AS n FROM domains WHERE site_id=${siteId}`,
      ),
    };
  }
  /**
   * Deletes a site in one transaction: unpublishes it (the Site Host serves only PUBLISHED), hides it from the account
   * and from the allowance, and writes the audit record. Idempotent: a second call changes nothing and says so.
   * The row, its immutable versions and its enquiries are kept; see docs/security for the retention decision.
   */
  async deleteSite(i: {
    siteId: string;
    orgId: string;
    actorUserId: string;
    requestId?: string;
  }): Promise<{ deleted: boolean; alreadyDeleted: boolean }> {
    return this.inTransaction(async (tx) => {
      const row = (
        await tx.sql`SELECT * FROM sites WHERE id=${i.siteId} AND org_id=${i.orgId} FOR UPDATE`
      )[0];
      if (!row) return { deleted: false, alreadyDeleted: false };
      if (row.deleted_at) return { deleted: true, alreadyDeleted: true };
      const wasLive = row.status === "PUBLISHED";
      await tx.sql`UPDATE sites SET status='UNPUBLISHED',deleted_at=now(),deleted_by=${i.actorUserId},updated_at=now() WHERE id=${i.siteId}`;
      // Everything that could still act on the site is retired in the same transaction: custom domains are released (the
      // Site Host serves only ACTIVE/VERIFYING), and recovery actions that were waiting to run are rejected.
      const released =
        await tx.sql`UPDATE domains SET state='RELEASED' WHERE site_id=${i.siteId} AND state <> 'RELEASED' RETURNING id`;
      for (const d of released)
        await tx.sql`INSERT INTO domain_status_events(id,domain_id,kind,detail) VALUES(${crypto.randomUUID()},${d.id as string},'RELEASED_BY_SITE_DELETION','{}'::jsonb)`;
      const cancelled =
        await tx.sql`UPDATE action_proposals SET state='REJECTED' WHERE site_id=${i.siteId} AND state IN ('PROPOSED','POLICY_EVALUATED','AWAITING_APPROVAL','READY') RETURNING id`;
      await tx.audit({
        orgId: i.orgId,
        actorUserId: i.actorUserId,
        action: "site.deleted",
        objectType: "site",
        objectId: i.siteId,
        ...(i.requestId ? { requestId: i.requestId } : {}),
        metadata: {
          name: String(row.name),
          slug: String(row.slug),
          wasLive,
          publicUrl: str(row.public_url),
          publishedVersionId: str(row.published_version_id),
          domainsReleased: released.length,
          actionsRejected: cancelled.length,
        },
      });
      return { deleted: true, alreadyDeleted: false };
    });
  }
  /**
   * Brings a deleted site back into the account (still unpublished) when the plan has room. Taken under the same
   * per-organisation lock as creation, so a restore racing a create can never exceed the allowance. Released domains are
   * not re-attached; the owner re-adds them deliberately.
   */
  async restoreSite(i: {
    siteId: string;
    orgId: string;
    actorUserId: string;
    siteCap?: number;
    requestId?: string;
  }): Promise<{ restored: boolean; reason?: "not_found" | "not_deleted" }> {
    return this.inTransaction(async (tx) => {
      await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`sites:${i.orgId}`}))`;
      const row = (
        await tx.sql`SELECT * FROM sites WHERE id=${i.siteId} AND org_id=${i.orgId} FOR UPDATE`
      )[0];
      if (!row) return { restored: false, reason: "not_found" as const };
      if (!row.deleted_at)
        return { restored: false, reason: "not_deleted" as const };
      if (i.siteCap !== undefined) {
        const n = Number(
          (
            await tx.sql`SELECT COUNT(*)::int AS n FROM sites WHERE org_id=${i.orgId} AND deleted_at IS NULL`
          )[0]!.n,
        );
        if (n >= i.siteCap) throw new SiteAllowanceError(n, i.siteCap);
      }
      await tx.sql`UPDATE sites SET deleted_at=NULL,deleted_by=NULL,status='UNPUBLISHED',updated_at=now() WHERE id=${i.siteId}`;
      await tx.audit({
        orgId: i.orgId,
        actorUserId: i.actorUserId,
        action: "site.restored",
        objectType: "site",
        objectId: i.siteId,
        ...(i.requestId ? { requestId: i.requestId } : {}),
        metadata: { name: String(row.name), slug: String(row.slug) },
      });
      return { restored: true };
    });
  }
  // ---- owner confirmations: statements a person has confirmed are true of their business (append-only) ----
  async confirmStatement(i: {
    siteId: string;
    orgId: string;
    userId: string;
    text: string;
    textSha256: string;
    requestId?: string;
  }) {
    return this.inTransaction(async (tx) => {
      const ins =
        await tx.sql`INSERT INTO owner_confirmations(id,site_id,org_id,user_id,text_sha256,text) VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${i.userId},${i.textSha256},${i.text}) ON CONFLICT (site_id,text_sha256) DO NOTHING RETURNING id`;
      if (ins.length)
        await tx.audit({
          orgId: i.orgId,
          actorUserId: i.userId,
          action: "site.fact_confirmed",
          objectType: "site",
          objectId: i.siteId,
          ...(i.requestId ? { requestId: i.requestId } : {}),
          metadata: { textSha256: i.textSha256 },
        });
      return { created: ins.length > 0, textSha256: i.textSha256 };
    });
  }
  async confirmedHashes(siteId: string): Promise<Set<string>> {
    const r = await this
      .sql`SELECT text_sha256 FROM owner_confirmations WHERE site_id=${siteId}`;
    return new Set(r.map((x) => String(x.text_sha256)));
  }
  async listConfirmations(siteId: string) {
    const r = await this
      .sql`SELECT id,text,text_sha256,user_id,created_at FROM owner_confirmations WHERE site_id=${siteId} ORDER BY created_at`;
    return r.map((x) => ({
      id: String(x.id),
      text: String(x.text),
      textSha256: String(x.text_sha256),
      userId: String(x.user_id),
      createdAt: iso(x.created_at),
    }));
  }
  /** True only when `url` is one of this site's own uploaded pictures (the shape the owner-media pipeline issues). */
  async ownerMediaBelongsTo(siteId: string, url: string): Promise<boolean> {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      return false;
    }
    const m =
      /^\/api\/public\/sites\/([0-9a-f-]{36})\/m\/([a-f0-9]{64})\/(?:w640|w1280|w1920|thumb)\.webp$|^\/api\/public\/sites\/([0-9a-f-]{36})\/m\/([a-f0-9]{64})\/logo\.png$/.exec(
        path,
      );
    const sid = m?.[1] ?? m?.[3];
    const sha = m?.[2] ?? m?.[4];
    if (!sid || !sha || sid !== siteId) return false;
    const r = await this
      .sql`SELECT 1 FROM owner_media WHERE site_id=${siteId} AND sha256=${sha} AND removed_at IS NULL`;
    return r.length > 0;
  }
  async listDeletedSites(orgId: string) {
    const rows = await this.sql`
      SELECT s.*, (SELECT COUNT(*)::int FROM form_submissions f WHERE f.site_id=s.id AND f.erased_at IS NULL) AS kept_enquiries,
             (SELECT COUNT(*)::int FROM form_submissions f WHERE f.site_id=s.id AND f.erased_at IS NOT NULL) AS erased_enquiries
      FROM sites s WHERE s.org_id=${orgId} AND s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC`;
    return rows.map((r) => ({
      ...mapSite(r),
      keptEnquiries: Number(r.kept_enquiries),
      erasedEnquiries: Number(r.erased_enquiries),
    }));
  }
  /** Enquiries of a site that is no longer in the account, for the owner to download before any erasure. */
  async exportDeletedEnquiries(siteId: string, orgId: string) {
    const rows = await this.sql`
      SELECT f.id,f.fields,f.status,f.submitted_at,f.erased_at FROM form_submissions f JOIN sites s ON s.id=f.site_id
      WHERE f.site_id=${siteId} AND s.org_id=${orgId} AND s.deleted_at IS NOT NULL ORDER BY f.submitted_at`;
    return rows.map((r) => ({
      id: String(r.id),
      fields: r.fields as Record<string, unknown>,
      status: String(r.status),
      submittedAt: iso(r.submitted_at),
      erasedAt: str(r.erased_at),
    }));
  }
  /**
   * Erases the personal content of a deleted site's enquiries. Only ever called for an explicit, confirmed request by an
   * administrator; nothing erases customer data on a timer. The rows stay (counts, dates and audit remain true) with their
   * content emptied and `erased_at` set. Idempotent.
   */
  async eraseDeletedEnquiries(i: {
    siteId: string;
    orgId: string;
    actorUserId: string;
    requestId?: string;
  }) {
    return this.inTransaction(async (tx) => {
      const site = (
        await tx.sql`SELECT id FROM sites WHERE id=${i.siteId} AND org_id=${i.orgId} AND deleted_at IS NOT NULL FOR UPDATE`
      )[0];
      if (!site) return null;
      const r =
        await tx.sql`UPDATE form_submissions SET fields='{}'::jsonb,erased_at=now() WHERE site_id=${i.siteId} AND erased_at IS NULL RETURNING id`;
      await tx.audit({
        orgId: i.orgId,
        actorUserId: i.actorUserId,
        action: "site.enquiries_erased",
        objectType: "site",
        objectId: i.siteId,
        ...(i.requestId ? { requestId: i.requestId } : {}),
        metadata: { erased: r.length },
      });
      return { erased: r.length };
    });
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
  ): Promise<boolean> {
    const r = await this
      .sql`UPDATE sites SET status=${status},public_url=COALESCE(${extra.publicUrl ?? null},public_url),published_version_id=COALESCE(${extra.publishedVersionId ?? null},published_version_id),updated_at=now() WHERE id=${id} AND deleted_at IS NULL`;
    return r.count > 0;
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
