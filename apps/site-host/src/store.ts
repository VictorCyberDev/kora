import type postgres from "postgres";
import type { SiteFiles } from "@kora/site-serving";
import type { SiteSpec } from "@kora/site-schema";

export interface HostedSite {
  id: string;
  slug: string;
  publishedVersionId: string;
}
export interface HostedVersion {
  files: SiteFiles;
  spec: SiteSpec;
}

/**
 * The Site Host's entire view of the database. Every query is a SELECT on four
 * tables; it never writes. Run it with a role that has SELECT on exactly these
 * tables (see docs/runbooks/site-host.md).
 */
export class SiteHostStore {
  constructor(private readonly sql: postgres.Sql) {}

  async ping(): Promise<boolean> {
    try {
      await this.sql`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
  async siteBySlug(slug: string): Promise<HostedSite | null> {
    const r = (
      await this
        .sql`SELECT id,slug,published_version_id FROM sites WHERE slug=${slug} AND status='PUBLISHED' AND published_version_id IS NOT NULL`
    )[0];
    return r
      ? {
          id: String(r.id),
          slug: String(r.slug),
          publishedVersionId: String(r.published_version_id),
        }
      : null;
  }
  async siteByHostname(hostname: string): Promise<HostedSite | null> {
    const r = (
      await this
        .sql`SELECT s.id,s.slug,s.published_version_id FROM domains d JOIN sites s ON s.id=d.site_id
        WHERE d.hostname=${hostname.toLowerCase()} AND d.state IN ('ACTIVE','VERIFYING') AND s.status='PUBLISHED' AND s.published_version_id IS NOT NULL`
    )[0];
    return r
      ? {
          id: String(r.id),
          slug: String(r.slug),
          publishedVersionId: String(r.published_version_id),
        }
      : null;
  }
  async version(
    siteId: string,
    versionId: string,
  ): Promise<HostedVersion | null> {
    const r = (
      await this
        .sql`SELECT artifact,spec FROM site_versions WHERE id=${versionId} AND site_id=${siteId}`
    )[0];
    return r
      ? { files: r.artifact as SiteFiles, spec: r.spec as SiteSpec }
      : null;
  }
  /** An unexpired controlled-test fault for the version that is currently live. */
  async activeFault(
    siteId: string,
    versionId: string,
  ): Promise<"http_500" | "timeout" | null> {
    const r = (
      await this
        .sql`SELECT mode FROM site_faults WHERE site_id=${siteId} AND version_id=${versionId} AND expires_at > now()`
    )[0];
    return r ? (String(r.mode) as "http_500" | "timeout") : null;
  }
}
