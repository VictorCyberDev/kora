import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { applyMigrations } from "./apply-migrations.js";

const base = process.env.DATABASE_URL;
const d = base ? describe : describe.skip;
const dir = new URL("./migrations/", import.meta.url);
const created: string[] = [];

async function freshDb(): Promise<{ url: string; sql: postgres.Sql }> {
  const u = new URL(base!);
  const name = `${decodeURIComponent(u.pathname.slice(1)).replace(/_test$/, "")}_m${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}_test`;
  const admin = new URL(base!);
  admin.pathname = "/postgres";
  const a = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  await a.unsafe(`CREATE DATABASE "${name}"`);
  await a.end();
  created.push(name);
  u.pathname = `/${name}`;
  return {
    url: u.toString(),
    sql: postgres(u.toString(), { max: 2, onnotice: () => {} }),
  };
}
afterAll(async () => {
  if (!base) return;
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const a = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  for (const n of created)
    await a.unsafe(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`);
  await a.end();
});

async function applyUpTo(sql: postgres.Sql, last: number) {
  const files = (await readdir(fileURLToPath(dir)))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  for (const f of files)
    if (Number(f.slice(0, 3)) <= last)
      await sql.unsafe(await readFile(new URL(f, dir), "utf8"));
}

d("migrations", () => {
  it("upgrades a populated 001-006 database to the latest schema without losing data", async () => {
    const { sql } = await freshDb();
    await applyUpTo(sql, 6);
    const svc = crypto.randomUUID();
    const inc = crypto.randomUUID();
    const obs = crypto.randomUUID();
    await sql`INSERT INTO services(id,name,health_url) VALUES(${svc},'legacy-demo','http://x/health')`;
    await sql`INSERT INTO telemetry_observations(id,service_id,observed_at,healthy,latency_ms) VALUES(${obs},${svc},now(),false,10)`;
    await sql`INSERT INTO incidents(id,service_id,deduplication_key,state,severity,started_at) VALUES(${inc},${svc},${`${svc}:health-check-unhealthy`},'DETECTED','HIGH',now())`;
    await sql`INSERT INTO incident_evidence(id,incident_id,observation_id,evidence_kind,threshold_count) VALUES(${crypto.randomUUID()},${inc},${obs},'trigger',1)`;
    await applyMigrations(sql); // 001-012; 001-006 are re-applied exactly as deployed databases will see them
    expect(
      (await sql`SELECT name FROM services WHERE id=${svc}`)[0]!.name,
    ).toBe("legacy-demo");
    expect(
      await sql`SELECT id FROM incident_evidence WHERE incident_id=${inc}`,
    ).toHaveLength(1);
    expect(
      (await sql`SELECT org_id,site_id FROM services WHERE id=${svc}`)[0],
    ).toMatchObject({ org_id: null, site_id: null });
    const tables = (
      await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    ).map((r) => String(r.table_name));
    for (const t of [
      "users",
      "sessions",
      "organizations",
      "sites",
      "site_versions",
      "action_proposals",
      "policy_decisions",
      "domains",
      "subscriptions",
      "audit_log",
      "site_faults",
    ])
      expect(tables, t).toContain(t);
    await sql.end();
  });

  it("is re-runnable: a second full pass changes nothing and errors nowhere", async () => {
    const { sql } = await freshDb();
    await applyMigrations(sql);
    const snap = async () =>
      JSON.stringify(
        await sql`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2`,
      );
    const first = await snap();
    await applyMigrations(sql);
    expect(await snap()).toBe(first);
    const constraints =
      await sql`SELECT conname FROM pg_constraint WHERE conname LIKE '%\\_site\\_org\\_fk'`;
    expect(constraints.length).toBeGreaterThanOrEqual(10);
    await sql.end();
  });

  it("old migrations are byte-stable (never rewritten): 001-006 hashes", async () => {
    const { createHash } = await import("node:crypto");
    const files = (await readdir(fileURLToPath(dir)))
      .filter((f) => /^00[1-6]_.+\.sql$/.test(f))
      .sort();
    expect(files).toHaveLength(6);
    const digest = createHash("sha256");
    for (const f of files) digest.update(await readFile(new URL(f, dir)));
    // Recorded from main at c38e34b; any edit to a deployed migration fails here.
    expect(digest.digest("hex")).toBe(EXPECTED_001_006);
  });
});

d("tenant integrity", () => {
  it("rejects rows that pair a site with another organization, at the database level", async () => {
    const { sql } = await freshDb();
    await applyMigrations(sql);
    const [u, orgA, orgB, siteA] = [1, 2, 3, 4].map(() => crypto.randomUUID());
    await sql`INSERT INTO users(id,email,password_hash,display_name) VALUES(${u!},'t@x.io','h','T')`;
    await sql`INSERT INTO organizations(id,name) VALUES(${orgA!},'A'),(${orgB!},'B')`;
    await sql`INSERT INTO sites(id,org_id,name,slug) VALUES(${siteA!},${orgA!},'S','site-a-1')`;
    const spec = sql.json({});
    const mismatched = (n: number) =>
      sql`INSERT INTO site_versions(id,site_id,org_id,number,spec,spec_hash,artifact_hash,artifact,generation_source) VALUES(${crypto.randomUUID()},${siteA!},${orgB!},${n},${spec},'h','h',${sql.json({})},'MANUAL')`;
    await expect(mismatched(1)).rejects.toThrow(/site_versions_site_org_fk/);
    await expect(
      sql`INSERT INTO form_submissions(id,site_id,org_id,fields) VALUES(${crypto.randomUUID()},${siteA!},${orgB!},${sql.json({})})`,
    ).rejects.toThrow(/form_submissions_site_org_fk/);
    await expect(
      sql`INSERT INTO domains(id,org_id,site_id,hostname,flow,provider,state,target) VALUES(${crypto.randomUUID()},${orgB!},${siteA!},'a.example.com','CONNECT_EXISTING','manual-dns','DNS_REQUIRED','t')`,
    ).rejects.toThrow(/domains_site_org_fk/);
    await expect(
      sql`INSERT INTO notifications(id,org_id,site_id,kind,title,body) VALUES(${crypto.randomUUID()},${orgB!},${siteA!},'k','t','b')`,
    ).rejects.toThrow(/notifications_site_org_fk/);
    // The correct pairing works.
    await sql`INSERT INTO site_versions(id,site_id,org_id,number,spec,spec_hash,artifact_hash,artifact,generation_source) VALUES(${crypto.randomUUID()},${siteA!},${orgA!},1,${spec},'h','h',${sql.json({})},'MANUAL')`;
    await sql.end();
  });

  it("a fault can only target a version of its own site", async () => {
    const { sql } = await freshDb();
    await applyMigrations(sql);
    const [org, s1, s2] = [1, 2, 3].map(() => crypto.randomUUID());
    await sql`INSERT INTO organizations(id,name) VALUES(${org!},'O')`;
    await sql`INSERT INTO sites(id,org_id,name,slug) VALUES(${s1!},${org!},'One','site-one-1'),(${s2!},${org!},'Two','site-two-1')`;
    const v2 = crypto.randomUUID();
    await sql`INSERT INTO site_versions(id,site_id,org_id,number,spec,spec_hash,artifact_hash,artifact,generation_source) VALUES(${v2},${s2!},${org!},1,${sql.json({})},'h','h',${sql.json({})},'MANUAL')`;
    await expect(
      sql`INSERT INTO site_faults(site_id,version_id,mode) VALUES(${s1!},${v2},'http_500')`,
    ).rejects.toThrow(/site_faults_version_site_fk/);
    await sql.end();
  });
});

const EXPECTED_001_006 =
  "c0cccf72c5fe36038934df6c6f4e0771bdecc2d780febf199c18b0b41be95ec9";
