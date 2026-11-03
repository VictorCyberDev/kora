import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  BrandOSSchema,
  brandOsHash,
  type BrandOS,
  type DesignTrace,
} from "@kora/creative";
import { withBrandOs, type SiteSpecV3 } from "@kora/site-schema";

const toJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as postgres.JSONValue;

export interface BrandOsRow {
  version: number;
  hash: string;
  grammarId: string;
  directionName: string;
  createdAt: string;
  brandOs: BrandOS;
}

/** Append-only Brand OS history for a site. A version is written only when the brand actually changed. */
export class BrandOsStore {
  constructor(private readonly sql: postgres.Sql) {}

  async latest(siteId: string): Promise<BrandOsRow | null> {
    const r = (
      await this
        .sql`SELECT version, hash, grammar_id, direction_name, created_at, brand_os FROM brand_os_versions WHERE site_id=${siteId} ORDER BY version DESC LIMIT 1`
    )[0];
    return r ? this.row(r) : null;
  }
  async list(
    siteId: string,
    limit = 20,
  ): Promise<Omit<BrandOsRow, "brandOs">[]> {
    const rows = await this
      .sql`SELECT version, hash, grammar_id, direction_name, created_at FROM brand_os_versions WHERE site_id=${siteId} ORDER BY version DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      version: Number(r.version),
      hash: String(r.hash),
      grammarId: String(r.grammar_id),
      directionName: String(r.direction_name),
      createdAt: new Date(r.created_at as string).toISOString(),
    }));
  }
  async get(siteId: string, version: number): Promise<BrandOsRow | null> {
    const r = (
      await this
        .sql`SELECT version, hash, grammar_id, direction_name, created_at, brand_os FROM brand_os_versions WHERE site_id=${siteId} AND version=${version}`
    )[0];
    return r ? this.row(r) : null;
  }
  private row(r: postgres.Row): BrandOsRow {
    return {
      version: Number(r.version),
      hash: String(r.hash),
      grammarId: String(r.grammar_id),
      directionName: String(r.direction_name),
      createdAt: new Date(r.created_at as string).toISOString(),
      brandOs: BrandOSSchema.parse(r.brand_os),
    };
  }

  /**
   * Stamps a v3 spec with the Brand OS it embodies. If the brand is unchanged from the latest version the stamp is
   * kept (content edits never create a brand version); otherwise version N+1 is stored.
   */
  async stamp(
    site: { id: string; orgId: string },
    spec: SiteSpecV3,
    userId: string | null,
  ): Promise<SiteSpecV3> {
    const latest = await this.latest(site.id);
    if (latest) {
      const same = withBrandOs(spec, latest.version);
      if (brandOsHash(same.brandOs) === latest.hash) return same.spec;
    }
    const next = withBrandOs(spec, (latest?.version ?? 0) + 1);
    await this.sql`
      INSERT INTO brand_os_versions (id, site_id, org_id, version, hash, grammar_id, direction_name, brand_os, created_by)
      VALUES (${randomUUID()}, ${site.id}, ${site.orgId}, ${next.brandOs.version}, ${brandOsHash(next.brandOs)},
        ${next.brandOs.grammarId}, ${spec.brand.directionName}, ${this.sql.json(toJson(next.brandOs))}, ${userId})
      ON CONFLICT (site_id, version) DO NOTHING`;
    return next.spec;
  }

  async feedback(
    site: { id: string; orgId: string },
    kind: string,
    subject: string,
    detail: unknown,
    userId: string | null,
  ) {
    await this
      .sql`INSERT INTO creative_feedback (id, site_id, org_id, kind, subject, detail, created_by) VALUES (${randomUUID()}, ${site.id}, ${site.orgId}, ${kind}, ${subject.slice(0, 80)}, ${this.sql.json(toJson(detail))}, ${userId})`;
  }
  /**
   * Every remembered design decision for an organisation over the last year, newest first. Decisions made before
   * traits were recorded carry no design facts and are skipped rather than guessed at.
   */
  async designHistory(orgId: string, now = Date.now()): Promise<DesignTrace[]> {
    const rows = await this
      .sql`SELECT kind, detail, created_at FROM creative_feedback
        WHERE org_id=${orgId} AND kind IN ('DIRECTION_CHOSEN','DIRECTION_REJECTED')
          AND created_at > to_timestamp(${(now - 365 * 86_400_000) / 1000})
        ORDER BY created_at DESC LIMIT 200`;
    const out: DesignTrace[] = [];
    for (const r of rows) {
      const d = r.detail as Record<string, unknown> | null;
      const t = d?.traits as Record<string, unknown> | undefined;
      if (
        !t ||
        typeof t.grammarId !== "string" ||
        typeof t.typeVoice !== "string" ||
        typeof t.colorwayId !== "string" ||
        typeof t.compositionMode !== "string"
      )
        continue;
      out.push({
        grammarId: t.grammarId,
        typeVoice: t.typeVoice,
        colorwayId: t.colorwayId,
        compositionMode: t.compositionMode,
        outcome: r.kind === "DIRECTION_CHOSEN" ? "chosen" : "rejected",
        at: new Date(r.created_at as string | Date).getTime(),
      });
    }
    return out;
  }
  async feedbackSummary(siteId: string) {
    const rows = await this
      .sql`SELECT kind, subject, count(*)::int AS n FROM creative_feedback WHERE site_id=${siteId} GROUP BY kind, subject ORDER BY n DESC LIMIT 50`;
    return rows.map((r) => ({
      kind: String(r.kind),
      subject: String(r.subject),
      count: Number(r.n),
    }));
  }
}

/** Taste is only claimed when the evidence repeats: a single choice is a data point, not a preference. */
export function learnedTaste(
  summary: Array<{ kind: string; subject: string; count: number }>,
) {
  const chosen = summary
    .filter((s) => s.kind === "DIRECTION_CHOSEN" && s.count >= 3)
    .map((s) => s.subject);
  const rejected = summary
    .filter((s) => s.kind === "DIRECTION_REJECTED" && s.count >= 3)
    .map((s) => s.subject);
  return {
    chosen,
    rejected,
    confident: chosen.length + rejected.length > 0,
    note:
      chosen.length + rejected.length
        ? "Based on repeated choices."
        : "Not enough choices yet to say what you prefer.",
  };
}
