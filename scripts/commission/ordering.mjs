// Deployment-order rehearsal: what a NEW Site Host does on a database that has NOT yet been migrated to this release.
//   node scripts/commission/ordering.mjs <outDir>      (prints JSON: {steps:[{name,ok,detail}]})
import fs from "node:fs";
import path from "node:path";
import {
  postgres,
  PG_ADMIN,
  startProc,
  stopProc,
  until,
  health,
  repo,
} from "./lib.mjs";

const outDir = path.resolve(process.argv[2] ?? ".");
const DB = "kora_order_test";
const admin = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${DB}`);
await admin.end();
const url = PG_ADMIN.replace(/\/[^/]*$/, `/${DB}`);
const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = path.join(repo, "apps/api/src/db/migrations");
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();
for (const f of files)
  if (parseInt(f, 10) <= 27)
    await sql.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
const steps = [];
const add = (name, ok, detail = "") => steps.push({ name, ok: !!ok, detail });
add(
  "database is at migration 027 (no deleted_at column yet)",
  (
    await sql`SELECT 1 FROM information_schema.columns WHERE table_name='sites' AND column_name='deleted_at'`
  ).length === 0,
);
const logs = path.join(outDir, "service-logs");
fs.mkdirSync(logs, { recursive: true });
const hostUrl = "http://127.0.0.1:3341";
const env = {
  DATABASE_URL: url,
  NODE_ENV: "development",
  PORT: "3341",
  SITE_HOST_PUBLIC_URL: hostUrl,
  LOG_LEVEL: "warn",
};
let host = startProc(
  logs,
  "ordering-site-host-unmigrated",
  ["apps/site-host/dist/server.js"],
  env,
  repo,
);
await until(
  async () => (await fetch(hostUrl + "/health").catch(() => null)) !== null,
  30,
  300,
);
const h1 = await fetch(hostUrl + "/health")
  .then(async (r) => ({ s: r.status, b: await r.json() }))
  .catch(() => ({ s: 0, b: {} }));
add(
  "new Site Host on the un-migrated database: readiness is 503 (schema outdated), so a platform will not route traffic to it",
  h1.s === 503 && h1.b.schema === "outdated",
  JSON.stringify(h1),
);
const sr = await fetch(hostUrl + "/s/anything/")
  .then((r) => r.status)
  .catch(() => 0);
add(
  "... and a site request fails with a server error (this is what readiness used to hide)",
  sr >= 500,
  String(sr),
);
await stopProc(host);
for (const f of files)
  if (parseInt(f, 10) > 27)
    await sql.unsafe(fs.readFileSync(path.join(dir, f), "utf8"));
host = startProc(
  logs,
  "ordering-site-host-migrated",
  ["apps/site-host/dist/server.js"],
  env,
  repo,
);
await until(() => health(hostUrl), 30, 300);
const h2 = await fetch(hostUrl + "/health")
  .then(async (r) => ({ s: r.status, b: await r.json() }))
  .catch(() => ({ s: 0, b: {} }));
add(
  "after migrations 028-030 the same Site Host is ready (200, schema ok)",
  h2.s === 200 && h2.b.schema === "ok",
  JSON.stringify(h2),
);
const sr2 = await fetch(hostUrl + "/s/anything/")
  .then((r) => r.status)
  .catch(() => 0);
add(
  "... and an unknown site is a clean 404, not an error",
  sr2 === 404,
  String(sr2),
);
await stopProc(host);
await sql.end();
const a2 = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await a2.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await a2.end();
console.log(JSON.stringify({ steps }));
