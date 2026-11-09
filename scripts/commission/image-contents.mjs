// Production-image CONTENTS rehearsal. Docker is not available here, so the image cannot be built; this assembles a directory
// from exactly the files the root Dockerfile COPYs (plus `pnpm install --prod`), then runs the API (which serves the web app)
// and the Site Host from that directory with NODE_ENV=production. It proves nothing the Dockerfile's COPY list omits is needed
// at runtime; it does NOT prove the image builds, its size, or the non-root user. Those stay hosted/CI-only.
//   node scripts/commission/image-contents.mjs <outDir>      (prints JSON {steps, sizes})
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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
const tree = process.env.COMMISSION_IMAGE_DIR ?? "/var/tmp/kora-image";
const KOCHAB =
  "Kochab Studio is a creative technology agency helping startups and growing businesses build premium websites, powerful brands, and digital experiences. We combine software development, design, motion graphics, and marketing automation to help brands launch and grow.";
const steps = [];
const add = (name, ok, detail = "") =>
  steps.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) });
fs.rmSync(tree, { recursive: true, force: true });
fs.mkdirSync(tree, { recursive: true });

// 1. what the Dockerfile copies
let stage = "";
let copied = 0;
for (const l of fs
  .readFileSync(path.join(repo, "Dockerfile"), "utf8")
  .split("\n")) {
  const fm = l.match(/^FROM\s+\S+\s+AS\s+(\w+)/i);
  if (fm) stage = fm[1];
  if (!/^COPY\s/.test(l)) continue;
  // manifests stage: package.json files (needed for the install). runtime stage: build output copied from the build stage.
  // The build stage (sources) and the deps stage (node_modules, produced by the install below) are not copied.
  const m = l.match(/^COPY\s+(?:--from=(\w+)\s+)?(\S+)\s+(\S+)$/);
  if (!m) continue;
  const [, from, src, dest] = m;
  const inManifests = stage === "manifests" && !from;
  const inRuntime = stage === "runtime" && from === "build";
  if (!inManifests && !inRuntime) continue;
  if (src.includes("build-info")) continue;
  const s = path.join(repo, src.replace(/^\/app\//, ""));
  const d = path.join(tree, dest.replace(/^\.\//, ""));
  if (!fs.existsSync(s)) continue;
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.cpSync(s, d, { recursive: true });
  copied++;
}
for (const f of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])
  fs.copyFileSync(path.join(repo, f), path.join(tree, f));
fs.writeFileSync(
  path.join(tree, "build-info.json"),
  JSON.stringify({
    commit: "0".repeat(40),
    builtAt: new Date().toISOString(),
    source: "image-contents rehearsal",
  }),
);
add(
  "assembled the runtime tree from the Dockerfile COPY list",
  copied > 20,
  `${copied} COPY entries`,
);

// 2. production dependencies only
const inst = spawnSync(
  "pnpm",
  ["install", "--frozen-lockfile", "--prod", "--offline"],
  { cwd: tree, encoding: "utf8", timeout: 600_000 },
);
add(
  "pnpm install --frozen-lockfile --prod succeeds on the copied manifests",
  inst.status === 0,
  inst.status === 0 ? "" : (inst.stdout + inst.stderr).slice(-250),
);
const du = (p) => execFileSync("du", ["-sk", p]).toString().split("\t")[0] * 1;
const sizes = {
  treeMB: Math.round(du(tree) / 1024),
  nodeModulesMB: Math.round(du(path.join(tree, "node_modules")) / 1024),
  media_files_MB: Math.round(
    du(path.join(tree, "packages/site-media/files")) / 1024,
  ),
  web_dist_KB: du(path.join(tree, "apps/web/dist")),
  api_dist_KB: du(path.join(tree, "apps/api/dist")),
};

// 3. run it in production mode
const DB = "kora_image_test";
const admin = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${DB}`);
await admin.end();
const url = PG_ADMIN.replace(/\/[^/]*$/, `/${DB}`);
const logs = path.join(outDir, "service-logs");
fs.mkdirSync(logs, { recursive: true });
const API = 3350,
  HOST = 3351;
const apiUrl = `http://127.0.0.1:${API}`,
  hostUrl = `http://127.0.0.1:${HOST}`;
const host = startProc(
  logs,
  "image-site-host",
  ["apps/site-host/dist/server.js"],
  {
    DATABASE_URL: url,
    NODE_ENV: "production",
    PORT: String(HOST),
    SITE_HOST_PUBLIC_URL: hostUrl,
    LOG_LEVEL: "warn",
  },
  tree,
);
const api = startProc(
  logs,
  "image-api",
  ["apps/api/dist/server.js"],
  {
    DATABASE_URL: url,
    NODE_ENV: "production",
    API_PORT: String(API),
    API_HOST: "127.0.0.1",
    LOG_LEVEL: "info",
    KORA_AUTO_MIGRATE: "true",
    KORA_PUBLIC_URL: apiUrl,
    SITE_HOST_PUBLIC_URL: hostUrl,
    KORA_COOKIE_SECURE: "false",
    KORA_ENVIRONMENT: "image-rehearsal",
    KORA_SECRETS_KEY: Buffer.alloc(32, 11).toString("base64"),
    KORA_CREATIVE_ENGINE: "v3",
    KORA_MEDIA_UNSPLASH: "off",
    KORA_MODEL_COMPOSE: "false",
    MONITOR_ENABLED: "true",
    KORA_LEGACY_MONITOR: "false",
    MONITOR_HEALTH_URL: `${apiUrl}/health`,
    KORA_MEDIA_PUBLIC_URL: "https://media.commission.example",
  },
  tree,
);
const up = await until(
  async () => (await health(apiUrl)) && (await health(hostUrl)),
  80,
  500,
);
add(
  "API and Site Host start from the assembled tree with NODE_ENV=production and the documented staging values",
  !!up && !api.exited && !host.exited,
  up ? "" : fs.readFileSync(api.file, "utf8").slice(-300),
);
if (up) {
  const root = await fetch(apiUrl + "/");
  add(
    "the web application is served from apps/web/dist in that tree",
    root.status === 200 && /<script/.test(await root.text()),
  );
  const c = client(apiUrl);
  const su = await c.call("POST", "/api/auth/signup", {
    email: `image+${Date.now()}@example.com`,
    password: "correct horse battery",
    displayName: "Image Check",
    orgName: "Image Check",
  });
  const me = await c.call("GET", "/api/auth/me");
  add("signup works in production mode", su.status === 201, String(su.status));
  const site = await c.call("POST", "/api/sites", {
    orgId: me.json?.data?.orgs?.[0]?.id,
    name: "Kochab Studio",
    description: KOCHAB,
  });
  const g = await c.call("POST", `/api/sites/${site.json?.data?.id}/generate`, {
    name: "Kochab Studio",
    description: KOCHAB,
  });
  const spec = (
    await c.call(
      "GET",
      `/api/sites/${site.json?.data?.id}/versions/${g.json?.data?.version?.id}`,
    )
  ).json?.data?.spec;
  add(
    "a Kochab Studio site generates in the assembled tree (v3, six pages)",
    g.status === 201 && spec?.version === 3 && spec.pages.length === 6,
    `${g.status} ${spec?.pages?.length} pages`,
  );
  const pub = await c.call(
    "POST",
    `/api/sites/${site.json?.data?.id}/versions/${g.json?.data?.version?.id}/publish`,
  );
  add(
    "published and verified (MATCH) from the assembled tree",
    pub.json?.data?.verification?.status === "MATCH",
    pub.json?.data?.verification?.status,
  );
  const pg = await fetch(pub.json?.data?.publicUrl);
  add("the Site Host in that tree serves the site", pg.status === 200);
  const img = (await pg.text()).match(/\/_kora\/media\/[^"')]+/)?.[0];
  const im = img ? await fetch(hostUrl + img) : null;
  add(
    "bundled photographs are present in that tree and served (or the site is legitimately photo-free)",
    !img || im?.status === 200,
    img ?? "no photo on the home page",
  );
  const catalogue = await c.call(
    "GET",
    `/api/sites/${site.json?.data?.id}/media/catalogue`,
  );
  add(
    "the catalogue endpoint works from that tree",
    catalogue.status === 200 && (catalogue.json?.data?.length ?? 0) > 0,
    String(catalogue.json?.data?.length),
  );
  const lg = fs.readFileSync(api.file, "utf8");
  add(
    "production-mode startup log states the switches; no module-not-found or startup error",
    /"creativeEngine":"v3"/.test(lg) &&
      !/Cannot find module|ERR_MODULE_NOT_FOUND|"level":50/.test(lg),
  );
}
await stopProc(api);
await stopProc(host);
const a2 = postgres(PG_ADMIN, { max: 1, onnotice: () => {} });
await a2.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
await a2.end();
console.log(JSON.stringify({ steps, sizes }));
