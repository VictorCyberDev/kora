import type postgres from "postgres";
import {
  BrandKitSchema,
  BusinessFactsSchema,
  type BrandKit,
  type BusinessFacts,
  type PresenceCheck,
} from "@kora/growth";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;

export interface ProfileRecord {
  siteId: string;
  orgId: string;
  facts: BusinessFacts;
  revision: number;
  updatedAt: string | null;
}
export interface BrandKitRecord {
  id: string;
  siteId: string;
  version: number;
  kit: BrandKit;
  origin: "DERIVED" | "OWNER";
  createdAt: string | null;
}

const mapProfile = (r: Row): ProfileRecord => ({
  siteId: String(r.site_id),
  orgId: String(r.org_id),
  facts: BusinessFactsSchema.parse(r.facts),
  revision: Number(r.revision),
  updatedAt: iso(r.updated_at),
});
const mapKit = (r: Row): BrandKitRecord => ({
  id: String(r.id),
  siteId: String(r.site_id),
  version: Number(r.version),
  kit: BrandKitSchema.parse(r.kit),
  origin: r.origin as "DERIVED" | "OWNER",
  createdAt: iso(r.created_at),
});

export class GrowthStore {
  constructor(private readonly sql: postgres.Sql) {}

  private tx<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    return this.sql.begin((t) =>
      fn(t as unknown as postgres.Sql),
    ) as Promise<T>;
  }

  // ---- business profile ---------------------------------------------------
  async getProfile(siteId: string): Promise<ProfileRecord | null> {
    const r = (
      await this.sql`SELECT * FROM business_profiles WHERE site_id=${siteId}`
    )[0];
    return r ? mapProfile(r) : null;
  }
  /** Writes the facts and appends a revision. `expectedRevision` makes concurrent edits fail instead of overwrite. */
  async saveProfile(i: {
    siteId: string;
    orgId: string;
    facts: BusinessFacts;
    source: "OWNER" | "SITE_IMPORT" | "SYSTEM";
    userId: string | null;
    expectedRevision: number | null;
  }): Promise<ProfileRecord> {
    return this.tx(async (sql) => {
      const cur = (
        await sql`SELECT revision FROM business_profiles WHERE site_id=${i.siteId} FOR UPDATE`
      )[0];
      const next = cur ? Number(cur.revision) + 1 : 1;
      if (
        cur &&
        i.expectedRevision !== null &&
        Number(cur.revision) !== i.expectedRevision
      )
        throw new RevisionConflict(Number(cur.revision));
      if (!cur && i.expectedRevision !== null && i.expectedRevision !== 0)
        throw new RevisionConflict(0);
      const facts = sql.json(i.facts);
      const r = (
        cur
          ? await sql`UPDATE business_profiles SET facts=${facts},revision=${next},updated_by=${i.userId},updated_at=now() WHERE site_id=${i.siteId} RETURNING *`
          : await sql`INSERT INTO business_profiles(site_id,org_id,facts,revision,updated_by) VALUES(${i.siteId},${i.orgId},${facts},1,${i.userId}) RETURNING *`
      )[0]!;
      await sql`INSERT INTO business_profile_revisions(site_id,org_id,revision,facts,source,changed_by) VALUES(${i.siteId},${i.orgId},${next},${facts},${i.source},${i.userId})`;
      return mapProfile(r);
    });
  }
  async profileHistory(siteId: string, limit = 20) {
    return (
      await this
        .sql`SELECT revision,source,changed_by,created_at FROM business_profile_revisions WHERE site_id=${siteId} ORDER BY revision DESC LIMIT ${limit}`
    ).map((r) => ({
      revision: Number(r.revision),
      source: String(r.source),
      changedBy: (r.changed_by as string | null) ?? null,
      createdAt: iso(r.created_at),
    }));
  }

  // ---- brand kit ----------------------------------------------------------
  async latestBrandKit(siteId: string): Promise<BrandKitRecord | null> {
    const r = (
      await this
        .sql`SELECT * FROM brand_kits WHERE site_id=${siteId} ORDER BY version DESC LIMIT 1`
    )[0];
    return r ? mapKit(r) : null;
  }
  async brandKitVersions(siteId: string): Promise<BrandKitRecord[]> {
    return (
      await this
        .sql`SELECT * FROM brand_kits WHERE site_id=${siteId} ORDER BY version DESC LIMIT 50`
    ).map(mapKit);
  }
  async getBrandKit(siteId: string, version: number) {
    const r = (
      await this
        .sql`SELECT * FROM brand_kits WHERE site_id=${siteId} AND version=${version}`
    )[0];
    return r ? mapKit(r) : null;
  }
  /** Brand kits are never edited in place: every change is a new version, so published assets keep the kit they used. */
  async saveBrandKit(i: {
    siteId: string;
    orgId: string;
    kit: BrandKit;
    origin: "DERIVED" | "OWNER";
    userId: string | null;
  }): Promise<BrandKitRecord> {
    return this.tx(async (sql) => {
      await sql`SELECT id FROM sites WHERE id=${i.siteId} FOR UPDATE`;
      const n = Number(
        (
          await sql`SELECT COALESCE(MAX(version),0)+1 AS n FROM brand_kits WHERE site_id=${i.siteId}`
        )[0]!.n,
      );
      const r = (
        await sql`INSERT INTO brand_kits(id,site_id,org_id,version,kit,origin,created_by) VALUES(${crypto.randomUUID()},${i.siteId},${i.orgId},${n},${sql.json(i.kit)},${i.origin},${i.userId}) RETURNING *`
      )[0]!;
      return mapKit(r);
    });
  }

  // ---- presence checks ----------------------------------------------------
  async recordChecks(i: {
    siteId: string;
    orgId: string;
    profileRevision: number | null;
    brandVersion: number | null;
    counts: Record<string, number>;
    headline: string;
    checks: PresenceCheck[];
    userId: string | null;
  }) {
    return this.tx(async (sql) => {
      const id = crypto.randomUUID();
      await sql`INSERT INTO presence_checks(id,site_id,org_id,profile_revision,brand_version,counts,headline,checks,created_by)
        VALUES(${id},${i.siteId},${i.orgId},${i.profileRevision},${i.brandVersion},${sql.json(i.counts)},${i.headline},${sql.json(i.checks as unknown as postgres.JSONValue)},${i.userId})`;
      // Reconcile issues: close those no longer failing, open or refresh those that are.
      const failing = i.checks.filter((c) => c.status !== "OK");
      const ids = failing.map((c) => c.id);
      if (ids.length)
        await sql`UPDATE presence_issues SET resolved_at=now() WHERE site_id=${i.siteId} AND resolved_at IS NULL AND check_id NOT IN ${sql(ids)}`;
      else
        await sql`UPDATE presence_issues SET resolved_at=now() WHERE site_id=${i.siteId} AND resolved_at IS NULL`;
      for (const c of failing)
        await sql`INSERT INTO presence_issues(site_id,org_id,check_id,status,detail)
          VALUES(${i.siteId},${i.orgId},${c.id},${c.status},${sql.json(c as unknown as postgres.JSONValue)})
          ON CONFLICT (site_id, check_id) WHERE resolved_at IS NULL DO UPDATE SET status=EXCLUDED.status,detail=EXCLUDED.detail,last_seen_at=now()`;
      return id;
    });
  }
  async latestChecks(siteId: string) {
    const r = (
      await this
        .sql`SELECT * FROM presence_checks WHERE site_id=${siteId} ORDER BY created_at DESC LIMIT 1`
    )[0];
    return r
      ? {
          id: String(r.id),
          counts: r.counts as Record<string, number>,
          headline: String(r.headline),
          checks: r.checks as PresenceCheck[],
          createdAt: iso(r.created_at),
        }
      : null;
  }
  async openIssues(siteId: string) {
    return (
      await this
        .sql`SELECT check_id,status,detail,first_seen_at,last_seen_at FROM presence_issues WHERE site_id=${siteId} AND resolved_at IS NULL ORDER BY first_seen_at`
    ).map((r) => ({
      checkId: String(r.check_id),
      status: String(r.status),
      detail: r.detail as PresenceCheck,
      firstSeenAt: iso(r.first_seen_at),
      lastSeenAt: iso(r.last_seen_at),
    }));
  }
  /** Passports are derived from verified recoveries; used only to describe proof, never to create it. */
  async proofSummary(siteId: string) {
    const r = (
      await this
        .sql`SELECT COUNT(*)::int AS n, MAX(i.resolved_at) AS last FROM incidents i JOIN services s ON s.id=i.service_id WHERE s.site_id=${siteId} AND i.state='RESOLVED' AND i.resolved_at IS NOT NULL`
    )[0]!;
    return { passports: Number(r.n), lastPassportAt: iso(r.last) };
  }
  async enquiryStats(siteId: string, now: Date) {
    const r = (
      await this
        .sql`SELECT COUNT(*) FILTER (WHERE submitted_at > ${new Date(now.getTime() - 30 * 86_400_000).toISOString()})::int AS recent,
        COUNT(*) FILTER (WHERE status='NEW')::int AS waiting,
        MIN(submitted_at) FILTER (WHERE status='NEW') AS oldest
        FROM form_submissions WHERE site_id=${siteId}`
    )[0]!;
    return {
      enquiries30d: Number(r.recent),
      waiting: Number(r.waiting),
      oldestWaitingAt: iso(r.oldest),
    };
  }
}

export class RevisionConflict extends Error {
  constructor(readonly current: number) {
    super("The profile changed since you loaded it.");
  }
}
