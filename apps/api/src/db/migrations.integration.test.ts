import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { applyMigrations, migrateWithLock } from "./apply-migrations.js";

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
      "business_profiles",
      "brand_kits",
      "presence_checks",
      "channel_connections",
      "leads",
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

d("startup migration", () => {
  it("several processes starting together migrate exactly once, without errors", async () => {
    const { url, sql } = await freshDb();
    const peers = [1, 2, 3].map(() =>
      postgres(url, { max: 2, onnotice: () => {} }),
    );
    const applied: string[] = [];
    await Promise.all(
      peers.map((p) => migrateWithLock(p, (n) => applied.push(n))),
    );
    // Each process walks the (re-runnable) list, but never concurrently and never failing.
    const migrationCount = (await readdir(fileURLToPath(dir))).filter((f) =>
      /^\d{3}_.+\.sql$/.test(f),
    ).length;
    expect(applied.length).toBe(peers.length * migrationCount);
    expect(
      (
        await sql`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name IN ('sites','users','audit_log')`
      )[0]!.n,
    ).toBe(3);
    await Promise.all(peers.map((p) => p.end()));
    await sql.end();
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

d("migration set integrity", () => {
  const names = async () =>
    (await readdir(fileURLToPath(dir)))
      .filter((f) => f.endsWith(".sql"))
      .sort();

  it("every file is NNN_snake_case.sql and numbers run 001..N with no gaps or repeats", async () => {
    const files = await names();
    for (const f of files) expect(f, f).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
    files.forEach((f, i) => expect(Number(f.slice(0, 3)), f).toBe(i + 1));
    expect(files.length).toBeGreaterThanOrEqual(27);
  });

  it("migrations are applied in numeric order, each exactly once per pass", async () => {
    const { sql } = await freshDb();
    const seen: string[] = [];
    await applyMigrations(sql, (n) => seen.push(n));
    expect(seen).toEqual(await names());
    await sql.end();
  });

  it("deployed migrations 007-026 are byte-stable; anything new must be a new file", async () => {
    const { createHash } = await import("node:crypto");
    const files = (await names()).filter((f) => {
      const n = Number(f.slice(0, 3));
      return n >= 7 && n <= 26;
    });
    expect(files).toHaveLength(20);
    const digest = createHash("sha256");
    for (const f of files) digest.update(await readFile(new URL(f, dir)));
    // Recorded at the v7 closure. Editing a deployed migration fails here; add 028+ instead.
    expect(digest.digest("hex")).toBe(EXPECTED_007_026);
  });

  it("a database at the pre-v7 schema (024) upgrades to the v7 schema without losing its rows", async () => {
    const { sql } = await freshDb();
    await applyUpTo(sql, 24);
    const [u, org, site] = [1, 2, 3].map(() => crypto.randomUUID());
    await sql`INSERT INTO users(id,email,password_hash,display_name) VALUES(${u!},'up@x.io','h','U')`;
    await sql`INSERT INTO organizations(id,name) VALUES(${org!},'O')`;
    await sql`INSERT INTO sites(id,org_id,name,slug) VALUES(${site!},${org!},'S','site-up-1')`;
    await sql`INSERT INTO site_versions(id,site_id,org_id,number,spec,spec_hash,artifact_hash,artifact,generation_source) VALUES(${crypto.randomUUID()},${site!},${org!},1,${sql.json({})},'h','h',${sql.json({})},'MANUAL')`;
    const before =
      await sql`SELECT to_regclass('public.brand_os_versions') AS t, to_regclass('public.owner_media') AS o`;
    expect(before[0]).toMatchObject({ t: null, o: null });
    await applyMigrations(sql);
    expect(
      (
        await sql`SELECT count(*)::int AS n FROM site_versions WHERE site_id=${site!}`
      )[0]!.n,
    ).toBe(1);
    expect(
      (
        await sql`SELECT to_regclass('public.brand_os_versions') AS t, to_regclass('public.owner_media') AS o`
      )[0],
    ).toMatchObject({ t: "brand_os_versions", o: "owner_media" });
    await sql.end();
  });

  it("the v7 tables have the schema the code relies on: columns, checks, tenant keys, indexes, immutability", async () => {
    const { sql } = await freshDb();
    await applyMigrations(sql);
    const cols = async (t: string) =>
      Object.fromEntries(
        (
          await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=${t}`
        ).map((r) => [
          String(r.column_name),
          `${r.data_type}${r.is_nullable === "NO" ? "!" : ""}`,
        ]),
      );
    expect(await cols("brand_os_versions")).toMatchObject({
      site_id: "uuid!",
      version: "integer!",
      hash: "text!",
      brand_os: "jsonb!",
      created_at: "timestamp with time zone!",
    });
    expect(await cols("creative_feedback")).toMatchObject({
      kind: "text!",
      subject: "text!",
      detail: "jsonb!",
      org_id: "uuid!",
    });
    expect(await cols("owner_media")).toMatchObject({
      kind: "text!",
      sha256: "text!",
      focal_x: "real!",
      quality: "jsonb!",
      provenance: "jsonb!",
      thumb: "bytea!",
      removed_at: "timestamp with time zone",
      v1280: "bytea",
      logo_png: "bytea",
    });
    const fks = (
      await sql`SELECT conname FROM pg_constraint WHERE contype='f' AND conname IN ('brand_os_site_org_fk','creative_feedback_site_org_fk','owner_media_site_org_fk')`
    ).map((r) => String(r.conname));
    expect(fks.sort()).toEqual([
      "brand_os_site_org_fk",
      "creative_feedback_site_org_fk",
      "owner_media_site_org_fk",
    ]);
    const idx = (
      await sql`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('brand_os_versions','creative_feedback','owner_media')`
    ).map((r) => String(r.indexname));
    for (const i of [
      "brand_os_site_idx",
      "creative_feedback_site_idx",
      "creative_feedback_org_idx",
      "owner_media_site_idx",
      "owner_media_dedupe_idx",
    ])
      expect(idx, i).toContain(i);
    const triggers = (
      await sql`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`
    ).map((r) => String(r.tgname));
    expect(triggers).toContain("brand_os_versions_immutable");
    expect(triggers).toContain("creative_feedback_immutable");

    // behaviour, not just shape
    const [u, orgA, orgB, site] = [1, 2, 3, 4].map(() => crypto.randomUUID());
    await sql`INSERT INTO users(id,email,password_hash,display_name) VALUES(${u!},'v7@x.io','h','V')`;
    await sql`INSERT INTO organizations(id,name) VALUES(${orgA!},'A'),(${orgB!},'B')`;
    await sql`INSERT INTO sites(id,org_id,name,slug) VALUES(${site!},${orgA!},'S','site-v7-1')`;
    const hash = "a".repeat(64);
    const bos = (org: string, v: number) =>
      sql`INSERT INTO brand_os_versions(id,site_id,org_id,version,hash,grammar_id,direction_name,brand_os) VALUES(${crypto.randomUUID()},${site!},${org},${v},${hash},'g','d',${sql.json({})})`;
    await expect(bos(orgB!, 1)).rejects.toThrow(/brand_os_site_org_fk/);
    await bos(orgA!, 1);
    await expect(bos(orgA!, 1)).rejects.toThrow(); // one row per version
    await expect(
      sql`UPDATE brand_os_versions SET hash=${"b".repeat(64)} WHERE site_id=${site!}`,
    ).rejects.toThrow(); // history is immutable
    await expect(
      sql`INSERT INTO brand_os_versions(id,site_id,org_id,version,hash,grammar_id,direction_name,brand_os) VALUES(${crypto.randomUUID()},${site!},${orgA!},0,${hash},'g','d',${sql.json({})})`,
    ).rejects.toThrow(); // versions start at 1
    await expect(
      sql`INSERT INTO creative_feedback(id,site_id,org_id,kind,subject) VALUES(${crypto.randomUUID()},${site!},${orgA!},'NOT_A_KIND','x')`,
    ).rejects.toThrow();
    const photo = (sha: string, removed = false) =>
      sql`INSERT INTO owner_media(id,site_id,org_id,kind,sha256,width,height,quality,provenance,v1280,thumb,removed_at) VALUES(${crypto.randomUUID()},${site!},${orgA!},'photo',${sha},800,600,${sql.json({})},${sql.json({})},${Buffer.from("x")},${Buffer.from("t")},${removed ? new Date() : null})`;
    await photo("c".repeat(64));
    await expect(photo("c".repeat(64))).rejects.toThrow(); // same picture twice is refused
    await photo("c".repeat(64), true); // a removed copy does not block a re-upload history
    await expect(
      sql`INSERT INTO owner_media(id,site_id,org_id,kind,sha256,width,height,quality,provenance,thumb) VALUES(${crypto.randomUUID()},${site!},${orgA!},'logo',${"d".repeat(64)},10,10,${sql.json({})},${sql.json({})},${Buffer.from("t")})`,
    ).rejects.toThrow(/owner_media_kind_bytes/); // a logo must carry bytes
    await expect(
      sql`INSERT INTO owner_media(id,site_id,org_id,kind,sha256,width,height,quality,provenance,v1280,thumb,focal_x) VALUES(${crypto.randomUUID()},${site!},${orgA!},'photo',${"e".repeat(64)},10,10,${sql.json({})},${sql.json({})},${Buffer.from("x")},${Buffer.from("t")},1.5)`,
    ).rejects.toThrow(); // focal point stays inside the picture
    await sql.end();
  });
});

const EXPECTED_007_026 =
  "735e3f61608383114bb729d8c189c9df366aa223ee3b81817bd30993acc21b7f";
const EXPECTED_001_006 =
  "c0cccf72c5fe36038934df6c6f4e0771bdecc2d780febf199c18b0b41be95ec9";
