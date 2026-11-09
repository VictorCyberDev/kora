// Small load and memory measurement on this machine: one API, one Site Host, one throwaway database.
//   node scripts/commission/load.mjs <outDir>      (prints JSON; writes <outDir>/load-results.json)
// Single machine, loopback, 4 vCPU: the numbers size a minimum plan, they are not a capacity promise for hosted hardware.
import fs from "node:fs";
import path from "node:path";
import {
  postgres,
  PG_ADMIN,
  startProc,
  stopProc,
  until,
  health,
  client,
  repo,
} from "./lib.mjs";

const outDir = path.resolve(process.argv[2] ?? ".");
const DB = "kora_load_test";
const admin = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${DB}`);
await admin.end();
const url = PG_ADMIN.replace(/\/[^/]*$/, `/${DB}`);
const API = 3360,
  HOST = 3361;
const apiUrl = `http://127.0.0.1:${API}`,
  hostUrl = `http://127.0.0.1:${HOST}`;
const logs = path.join(outDir, "service-logs");
fs.mkdirSync(logs, { recursive: true });
const host = startProc(
  logs,
  "load-site-host",
  ["apps/site-host/dist/server.js"],
  {
    DATABASE_URL: url,
    NODE_ENV: "development",
    PORT: String(HOST),
    SITE_HOST_PUBLIC_URL: hostUrl,
    LOG_LEVEL: "warn",
  },
  repo,
);
const api = startProc(
  logs,
  "load-api",
  ["apps/api/dist/server.js"],
  {
    DATABASE_URL: url,
    NODE_ENV: "development",
    API_PORT: String(API),
    API_HOST: "127.0.0.1",
    LOG_LEVEL: "warn",
    KORA_AUTO_MIGRATE: "true",
    KORA_PUBLIC_URL: apiUrl,
    SITE_HOST_PUBLIC_URL: hostUrl,
    KORA_CREATIVE_ENGINE: "v3",
    KORA_MEDIA_UNSPLASH: "off",
    KORA_MODEL_COMPOSE: "false",
    KORA_SECRETS_KEY: Buffer.alloc(32, 13).toString("base64"),
    MONITOR_ENABLED: "true",
    KORA_LEGACY_MONITOR: "false",
    MONITOR_HEALTH_URL: `${apiUrl}/health`,
  },
  repo,
);
await until(
  async () => (await health(apiUrl)) && (await health(hostUrl)),
  80,
  500,
);
const rssKb = (p) =>
  Number(
    fs
      .readFileSync(`/proc/${p.child.pid}/status`, "utf8")
      .match(/VmRSS:\s+(\d+)/)?.[1],
  );
const hwm = (p) =>
  Number(
    fs
      .readFileSync(`/proc/${p.child.pid}/status`, "utf8")
      .match(/VmHWM:\s+(\d+)/)?.[1],
  );
const idle = {
  apiMB: Math.round(rssKb(api) / 1024),
  hostMB: Math.round(rssKb(host) / 1024),
};

const c = client(apiUrl);
await c.call("POST", "/api/auth/signup", {
  email: `load+${Date.now()}@example.com`,
  password: "correct horse battery",
  displayName: "Load",
  orgName: "Load",
});
const orgId = (await c.call("GET", "/api/auth/me")).json.data.orgs[0].id;
const desc = [
  "I bake cakes and small chops.",
  "I cut hair.",
  "Kochab Studio is a creative technology agency helping startups build premium websites, powerful brands and digital experiences.",
];
const urls = [];
const t0 = Date.now();
for (let i = 0; i < 3; i++) {
  const s = (
    await c.call("POST", "/api/sites", {
      orgId,
      name: ["Sweet Crumbs Bakery", "Mr Lee", "Kochab Studio"][i],
      description: desc[i],
    })
  ).json.data;
  const g = await c.call("POST", `/api/sites/${s.id}/generate`, {
    name: s.name,
    description: desc[i],
  });
  const p = await c.call(
    "POST",
    `/api/sites/${s.id}/versions/${g.json.data.version.id}/publish`,
  );
  urls.push(p.json.data.publicUrl);
}
const genPublishMs = Math.round((Date.now() - t0) / 3);

async function load(targets, seconds, concurrency) {
  const lat = [];
  let ok = 0,
    bad = 0,
    bytes = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, w) => {
      let i = w;
      while (Date.now() < end) {
        const t = performance.now();
        try {
          const r = await fetch(targets[i++ % targets.length]);
          bytes += (await r.arrayBuffer()).byteLength;
          r.status === 200 ? ok++ : bad++;
        } catch {
          bad++;
        }
        lat.push(performance.now() - t);
      }
    }),
  );
  lat.sort((a, b) => a - b);
  const q = (p) =>
    Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] * 10) /
    10;
  return {
    seconds,
    concurrency,
    requests: ok + bad,
    errors: bad,
    reqPerSec: Math.round((ok + bad) / seconds),
    p50ms: q(0.5),
    p95ms: q(0.95),
    p99ms: q(0.99),
    MBtransferred: Math.round(bytes / 1048576),
  };
}
const pages = urls.flatMap((u) => [u, `${u}gallery/`].filter(Boolean));
const siteLoad = await load(pages, 20, 20);
const apiLoad = await load([`${apiUrl}/health`, `${apiUrl}/`], 10, 10);
const out = {
  note: "one machine, loopback, 4 vCPU; sizes a minimum plan, not a capacity promise",
  idleRssMB: idle,
  afterLoadRssMB: {
    api: Math.round(rssKb(api) / 1024),
    siteHost: Math.round(rssKb(host) / 1024),
  },
  peakRssMB: {
    api: Math.round(hwm(api) / 1024),
    siteHost: Math.round(hwm(host) / 1024),
  },
  generateAndPublishOneSiteMsAvg: genPublishMs,
  siteHostLoad: siteLoad,
  apiLoad,
};
fs.writeFileSync(
  path.join(outDir, "load-results.json"),
  JSON.stringify(out, null, 2),
);
await stopProc(api);
await stopProc(host);
const a2 = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await a2.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await a2.end();
console.log(JSON.stringify(out, null, 2));
