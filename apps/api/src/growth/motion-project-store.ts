import type postgres from "postgres";
import type { MotionTimeline } from "@kora/growth";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
const iso = (value: unknown) => new Date(value as string | Date).toISOString();

export interface MotionProject {
  id: string;
  siteId: string;
  orgId: string;
  ownerId: string;
  name: string;
  timeline: MotionTimeline;
  revision: number;
  renderStatus: "IDLE" | "QUEUED" | "RENDERING" | "READY" | "FAILED";
  createdAt: string;
  updatedAt: string;
}

export interface MotionRevision {
  id: string;
  revision: number;
  timelineVersion: number;
  timeline: MotionTimeline;
  createdBy: string;
  createdAt: string;
}

const mapProject = (row: postgres.Row): MotionProject => ({
  id: String(row.id),
  siteId: String(row.site_id),
  orgId: String(row.org_id),
  ownerId: String(row.owner_id),
  name: String(row.name),
  timeline: row.source as MotionTimeline,
  revision: Number(row.revision),
  renderStatus: row.render_status as MotionProject["renderStatus"],
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const mapRevision = (row: postgres.Row): MotionRevision => ({
  id: String(row.id),
  revision: Number(row.revision),
  timelineVersion: Number(row.timeline_version),
  timeline: row.source as MotionTimeline,
  createdBy: String(row.created_by),
  createdAt: iso(row.created_at),
});

export class MotionProjectStore {
  constructor(private readonly sql: postgres.Sql) {}

  async create(input: {
    siteId: string;
    orgId: string;
    ownerId: string;
    name: string;
    timeline: MotionTimeline;
  }): Promise<MotionProject> {
    const id = crypto.randomUUID();
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO motion_projects
          (id,site_id,org_id,owner_id,name,timeline_version,source,
           brand_kit_version,brand_os_version,brand_os_hash)
        VALUES
          (${id},${input.siteId},${input.orgId},${input.ownerId},${input.name},
           ${input.timeline.version},${tx.json(json(input.timeline))},
           ${input.timeline.brand.kitVersion},
           ${input.timeline.brand.brandOsVersion},
           ${input.timeline.brand.brandOsHash})`;
      await tx`
        INSERT INTO motion_project_revisions
          (id,project_id,site_id,org_id,revision,timeline_version,source,created_by)
        VALUES
          (${crypto.randomUUID()},${id},${input.siteId},${input.orgId},1,
           ${input.timeline.version},${tx.json(json(input.timeline))},${input.ownerId})`;
    });
    return (await this.get(input.siteId, id))!;
  }

  async list(siteId: string): Promise<MotionProject[]> {
    return (
      await this.sql`
        SELECT * FROM motion_projects
        WHERE site_id=${siteId} AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 100`
    ).map(mapProject);
  }

  async get(siteId: string, id: string): Promise<MotionProject | null> {
    const row = (
      await this.sql`
        SELECT * FROM motion_projects
        WHERE site_id=${siteId} AND id=${id} AND deleted_at IS NULL`
    )[0];
    return row ? mapProject(row) : null;
  }

  async save(input: {
    siteId: string;
    id: string;
    expectedRevision: number;
    name: string;
    timeline: MotionTimeline;
    userId: string;
  }): Promise<MotionProject | "STALE" | null> {
    return this.sql.begin(async (tx) => {
      const row = (
        await tx`
          UPDATE motion_projects SET
            name=${input.name},
            timeline_version=${input.timeline.version},
            source=${tx.json(json(input.timeline))},
            brand_kit_version=${input.timeline.brand.kitVersion},
            brand_os_version=${input.timeline.brand.brandOsVersion},
            brand_os_hash=${input.timeline.brand.brandOsHash},
            revision=revision+1,
            render_status='IDLE',
            updated_at=now()
          WHERE site_id=${input.siteId} AND id=${input.id}
            AND deleted_at IS NULL AND revision=${input.expectedRevision}
          RETURNING *`
      )[0];
      if (!row) {
        const existing = (
          await tx`
            SELECT revision FROM motion_projects
            WHERE site_id=${input.siteId} AND id=${input.id} AND deleted_at IS NULL`
        )[0];
        return existing ? ("STALE" as const) : null;
      }
      const [projectId, siteId, orgId, revision] = [
        String(row.id),
        String(row.site_id),
        String(row.org_id),
        Number(row.revision),
      ] as const;
      await tx`
        INSERT INTO motion_project_revisions
          (id,project_id,site_id,org_id,revision,timeline_version,source,created_by)
        VALUES
          (${crypto.randomUUID()},${projectId},${siteId},${orgId},
           ${revision},${input.timeline.version},
           ${tx.json(json(input.timeline))},${input.userId})`;
      return mapProject(row);
    });
  }

  async revisions(siteId: string, id: string): Promise<MotionRevision[]> {
    return (
      await this.sql`
        SELECT r.* FROM motion_project_revisions r
        JOIN motion_projects p ON p.id=r.project_id AND p.site_id=r.site_id
        WHERE r.site_id=${siteId} AND r.project_id=${id}
          AND p.deleted_at IS NULL
        ORDER BY r.revision DESC LIMIT 100`
    ).map(mapRevision);
  }

  async revision(
    siteId: string,
    id: string,
    revision: number,
  ): Promise<MotionRevision | null> {
    const row = (
      await this.sql`
        SELECT r.* FROM motion_project_revisions r
        JOIN motion_projects p ON p.id=r.project_id AND p.site_id=r.site_id
        WHERE r.site_id=${siteId} AND r.project_id=${id}
          AND r.revision=${revision} AND p.deleted_at IS NULL`
    )[0];
    return row ? mapRevision(row) : null;
  }

  async duplicate(input: {
    siteId: string;
    id: string;
    ownerId: string;
    name?: string;
  }): Promise<MotionProject | null> {
    const source = await this.get(input.siteId, input.id);
    if (!source) return null;
    return this.create({
      siteId: source.siteId,
      orgId: source.orgId,
      ownerId: input.ownerId,
      name: input.name ?? `${source.name} copy`,
      timeline: source.timeline,
    });
  }

  async remove(siteId: string, id: string): Promise<boolean> {
    return (
      (
        await this.sql`
          UPDATE motion_projects SET deleted_at=now(),updated_at=now()
          WHERE site_id=${siteId} AND id=${id} AND deleted_at IS NULL
          RETURNING id`
      ).length > 0
    );
  }
}
