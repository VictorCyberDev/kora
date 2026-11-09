// Local commissioning rehearsal of the Creative Engine vNext release candidate, on one machine, with disposable services.
//
//   node scripts/commission/local.mjs <outDir> [--phases 0,1,2,...]
//
// Real here = real processes (API with the web app, Site Host), real HTTP, real PostgreSQL (a throwaway database whose name
// ends in "_test"). Mock = an external provider (Unsplash, a language model) replaced by a local fake server: those steps are
// tagged "mock" and are simulations, never evidence about the real provider. Nothing here touches a hosted service, a
// production database, bucket, domain or credential. The previous release (e2b62df) must be built at COMMISSION_BASE_DIR
// (default /var/tmp/kora-base) for the upgrade and rollback rehearsal.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  repo,
  postgres,
  DB_URL,
  resetDatabase,
  recorder,
  startProc,
  stopProc,
  logText,
  until,
  wait,
  health,
  client,
  png,
  fakeServer,
} from "./lib.mjs";
import { runJourneys } from "./journeys.mjs";

const outDir = path.resolve(
  process.argv[2] ??
    path.join(repo, "docs/evidence/creative-vnext/commissioning"),
);
const phasesArg = process.argv.indexOf("--phases");
const only =
  phasesArg > 0 ? new Set(process.argv[phasesArg + 1].split(",")) : null;
const want = (p) => !only || only.has(p);
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, "service-logs"), { recursive: true });
const svcLogs = path.join(outDir, "service-logs");
const baseDir = process.env.COMMISSION_BASE_DIR ?? "/var/tmp/kora-base";
const R = recorder(outDir);
const { step } = R;

const API = 3310,
  HOST = 3311;
const SECRETS = randomBytes(32).toString("base64"); // throwaway, local only
const apiUrl = `http://127.0.0.1:${API}`,
  hostUrl = `http://127.0.0.1:${HOST}`;
const stackEnv = (extra = {}) => ({
  DATABASE_URL: DB_URL,
  NODE_ENV: "development",
  API_PORT: String(API),
  API_HOST: "127.0.0.1",
  LOG_LEVEL: "info",
  KORA_PUBLIC_URL: apiUrl,
  SITE_HOST_PUBLIC_URL: hostUrl,
  KORA_MEDIA_PUBLIC_URL: "https://media.commission.example",
  KORA_SECRETS_KEY: SECRETS,
  KORA_CHAOS_ENABLED: "true",
  KORA_LEGACY_PUBLIC_API: "false",
  MONITOR_ENABLED: "true",
  MONITOR_INTERVAL_MS: "800",
  MONITOR_TIMEOUT_MS: "1500",
  MONITOR_FAILURE_THRESHOLD: "2",
  MONITOR_RECOVERY_THRESHOLD: "2",
  MONITOR_HEALTH_URL: `${apiUrl}/health`,
  ACTION_VERIFICATION_TICK_MS: "500",
  ACTION_VERIFICATION_TIMEOUT_MS: "60000",
  KORA_AUTO_MIGRATE: "true",
  ...extra,
});
const hostEnv = () => ({
  DATABASE_URL: DB_URL,
  NODE_ENV: "development",
  PORT: String(HOST),
  SITE_HOST_PUBLIC_URL: hostUrl,
  LOG_LEVEL: "warn",
});

let sql = null;
const live = {};
async function startApi(name, extra, cwd = repo) {
  live.api = startProc(
    svcLogs,
    name,
    ["apps/api/dist/server.js"],
    stackEnv(extra),
    cwd,
  );
  const ok = await until(() => health(apiUrl), 80, 500);
  return !!ok && !live.api.exited;
}
async function startHost(name, cwd = repo) {
  live.host = startProc(
    svcLogs,
    name,
    ["apps/site-host/dist/server.js"],
    hostEnv(),
    cwd,
  );
  return !!(await until(() => health(hostUrl), 60, 400));
}
const counts = async () => {
  const q = async (t) =>
    Number((await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`))[0].n);
  return {
    organizations: await q("organizations"),
    users: await q("users"),
    sites: await q("sites"),
    site_versions: await q("site_versions"),
    form_submissions: await q("form_submissions"),
  };
};
const migrationFiles = fs
  .readdirSync(path.join(repo, "apps/api/src/db/migrations"))
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .sort();
const stateFile0 = path.join(outDir, "state.json");
const state = fs.existsSync(stateFile0)
  ? JSON.parse(fs.readFileSync(stateFile0, "utf8"))
  : {};
const saveState = () =>
  fs.writeFileSync(stateFile0, JSON.stringify(state, null, 2));
let ctx5 = null;

try {
  // ---------------------------------------------------------------------------------------------------------------- 0
  if (want("0")) {
    R.setPhase("0 environment");
    await resetDatabase();
    step(
      "disposable database created (name ends in _test)",
      DB_URL.endsWith("_test"),
      DB_URL.replace(/\/\/.*@/, "//***@"),
    );
    const v = execFileSync("node", ["--version"]).toString().trim();
    step("node runtime", /^v22\./.test(v), v);
    step(
      "built artifacts of this release exist",
      [
        "apps/api/dist/server.js",
        "apps/site-host/dist/server.js",
        "apps/web/dist/index.html",
      ].every((f) => fs.existsSync(path.join(repo, f))),
    );
    step(
      "previous release (e2b62df) is built for the upgrade and rollback rehearsal",
      fs.existsSync(path.join(baseDir, "apps/api/dist/server.js")),
      baseDir,
    );
  }
  sql = postgres(DB_URL, { max: 2 });

  // ---------------------------------------------------------------------------------------------------------------- 1
  if (want("1")) {
    R.setPhase(
      "1 previous release (e2b62df) on migrations up to 027, with real customer-shaped data",
    );
    step(
      "site host (previous release) starts",
      await startHost("old-site-host", baseDir),
    );
    const ok = await startApi("old-api", {}, baseDir);
    step("API (previous release) starts and migrates an empty database", ok);
    const tables = (
      await sql`SELECT column_name FROM information_schema.columns WHERE table_name='sites'`
    ).map((r) => r.column_name);
    step(
      "previous schema has no deletion columns yet (so 028 is genuinely pending)",
      !tables.includes("deleted_at"),
    );
    const r = spawnSync(
      "node",
      [
        "scripts/commission-v7.mjs",
        apiUrl,
        "baseline",
        "--state",
        path.join(outDir, "v7-state.json"),
        "--out",
        path.join(outDir, "v7-baseline-old.json"),
      ],
      { cwd: repo, encoding: "utf8", timeout: 240_000 },
    );
    fs.writeFileSync(
      path.join(outDir, "v7-baseline-old.log"),
      r.stdout + r.stderr,
    );
    step(
      "commission-v7 baseline against the previous release (signup, v2 site, publish, verify MATCH, monitor)",
      r.status === 0,
      (r.stdout.match(/FAIL.*/g) ?? []).slice(0, 2).join(" | "),
    );
    const c = client(apiUrl);
    const st = JSON.parse(
      fs.readFileSync(path.join(outDir, "v7-state.json"), "utf8"),
    );
    state.v7 = st;
    const li = await c.call("POST", "/api/auth/login", {
      email: st.email,
      password: "correct horse battery",
    });
    step("legacy owner can log in", li.status === 200);
    const site = (await c.call("GET", `/api/sites/${st.baselineSite}`)).json
      .data;
    state.legacy = {
      siteId: site.id,
      name: site.name,
      publishedVersionId: site.publishedVersionId,
      status: site.status,
      publicUrl: site.publicUrl ?? null,
    };
    step(
      "legacy v2 site is published",
      site.status === "PUBLISHED" && !!site.publishedVersionId,
      site.status,
    );
    const sf = await c.call(
      "POST",
      `/api/public/sites/${site.id}/forms`,
      {
        name: "Legacy Visitor",
        phone: "08011112222",
        message: "Enquiry made before the upgrade",
      },
      { anonymous: true },
    );
    step(
      "a visitor enquiry is stored by the previous release",
      sf.status === 201,
      String(sf.status),
    );
    const html = await (
      await fetch(`${hostUrl}/`, {
        headers: { host: new URL(site.publicUrl ?? hostUrl).host },
      })
    )
      .text()
      .catch(() => "");
    state.legacy.homeBytes = html.length;
    state.before = await counts();
    fs.writeFileSync(
      path.join(outDir, "row-counts-before.json"),
      JSON.stringify(state.before, null, 2),
    );
    step(
      "row counts captured before the migrations",
      state.before.sites >= 1,
      JSON.stringify(state.before),
    );
    saveState();
    await stopProc(live.api);
  }

  // ---------------------------------------------------------------------------------------------------------------- 2
  if (want("2")) {
    R.setPhase(
      "2 migrations 028, 029, 030 rehearsed one at a time on that data",
    );
    const before = await counts();
    const has = async (q) => (await sql.unsafe(q)).length > 0;
    const col = (t, c) =>
      `SELECT 1 FROM information_schema.columns WHERE table_name='${t}' AND column_name='${c}'`;
    const tbl = (t) =>
      `SELECT 1 FROM information_schema.tables WHERE table_name='${t}'`;
    const checks = {
      "028_site_deletion.sql": async () =>
        (await has(col("sites", "deleted_at"))) &&
        (await has(col("sites", "deleted_by"))),
      "029_media_provider_quota.sql": async () =>
        await has(tbl("media_provider_quota")),
      "030_retirement_confirmations_media_state.sql": async () =>
        (await has(tbl("owner_confirmations"))) &&
        (await has(tbl("media_rate_counters"))) &&
        (await has(tbl("media_candidate_cache"))) &&
        (await has(tbl("media_selections"))) &&
        (await has(col("form_submissions", "erased_at"))),
    };
    for (const f of [
      "028_site_deletion.sql",
      "029_media_provider_quota.sql",
      "030_retirement_confirmations_media_state.sql",
    ]) {
      step(`${f} is part of this release`, migrationFiles.includes(f));
      step(`${f}: objects absent before`, !(await checks[f]()));
      const t0 = Date.now();
      let err = null;
      try {
        await sql.unsafe(
          fs.readFileSync(
            path.join(repo, "apps/api/src/db/migrations", f),
            "utf8",
          ),
        );
      } catch (e) {
        err = e.message;
      }
      const ms = Date.now() - t0;
      step(
        `${f}: applies without error`,
        !err,
        `${ms} ms${err ? " " + err : ""}`,
      );
      step(`${f}: objects present after`, await checks[f]());
      state.timings = { ...(state.timings ?? {}), [f]: ms };
      const t1 = Date.now();
      let err2 = null;
      try {
        await sql.unsafe(
          fs.readFileSync(
            path.join(repo, "apps/api/src/db/migrations", f),
            "utf8",
          ),
        );
      } catch (e) {
        err2 = e.message;
      }
      step(
        `${f}: applying it a second time is a no-op (re-runnable)`,
        !err2,
        `${Date.now() - t1} ms`,
      );
    }
    const after = await counts();
    step(
      "no rows lost or added by the migrations",
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify(after),
    );
    const ds =
      await sql`SELECT count(*)::int AS n FROM sites WHERE deleted_at IS NOT NULL`;
    step("existing sites are all 'not deleted' (NULL)", ds[0].n === 0);
    // append-only guarantee of owner_confirmations
    const org = (await sql`SELECT id FROM organizations LIMIT 1`)[0].id;
    const user = (await sql`SELECT id FROM users LIMIT 1`)[0].id;
    const site = (await sql`SELECT id FROM sites LIMIT 1`)[0].id;
    const cid = crypto.randomUUID();
    await sql`INSERT INTO owner_confirmations(id,site_id,org_id,user_id,text_sha256,text) VALUES(${cid},${site},${org},${user},${"a".repeat(64)},'rehearsal row')`;
    const upd =
      await sql`UPDATE owner_confirmations SET text='x' WHERE id=${cid}`.then(
        () => null,
        (e) => e.message,
      );
    const del = await sql`DELETE FROM owner_confirmations WHERE id=${cid}`.then(
      () => null,
      (e) => e.message,
    );
    step(
      "owner_confirmations rejects UPDATE and DELETE (append-only trigger)",
      !!upd && !!del,
      `${upd ?? "allowed"} / ${del ?? "allowed"}`,
    );
    const dom =
      await sql`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='domains'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%RELEASED%'`;
    step("domains.state now allows RELEASED", dom.length > 0);
    // the full ordered runner is also exercised (what KORA_AUTO_MIGRATE=true does at startup)
    const mod = await import(
      path.join(repo, "apps/api/dist/db/apply-migrations.js")
    );
    const applied = [];
    await mod.migrateWithLock(sql, (n) => applied.push(n));
    step(
      "the production runner (advisory-locked, all files in order) completes on the migrated database",
      applied.length === migrationFiles.length,
      `${applied.length} files`,
    );
    step(
      "row counts unchanged after the runner",
      JSON.stringify(await counts()) === JSON.stringify(before),
    );
    fs.writeFileSync(
      path.join(outDir, "migration-results.json"),
      JSON.stringify(
        {
          timingsMs: state.timings,
          files: migrationFiles.length,
          rowCountsBefore: before,
          rowCountsAfter: await counts(),
        },
        null,
        2,
      ),
    );
  }

  // ---------------------------------------------------------------------------------------------------------------- 3
  if (want("3")) {
    R.setPhase(
      "3 this release on the documented staging values (KORA_CREATIVE_ENGINE=v3, KORA_MEDIA_UNSPLASH=off, KORA_MODEL_COMPOSE=false)",
    );
    await stopProc(live.host);
    step("site host (this release) starts", await startHost("site-host"));
    const ok = await startApi("api-staging-values", {
      KORA_CREATIVE_ENGINE: "v3",
      KORA_MEDIA_UNSPLASH: "off",
      KORA_MODEL_COMPOSE: "false",
    });
    step("API starts with the documented staging values", ok);
    const lg = logText(live.api);
    const sw = lg.split("\n").find((l) => l.includes("release switches")) ?? "";
    step(
      "startup log states the effective switches",
      /"creativeEngine":"v3"/.test(sw) &&
        /"mediaUnsplash":"off"/.test(sw) &&
        /"modelCompose":false/.test(sw),
      sw.slice(0, 200),
    );
    step(
      "no configuration warning for the staging values",
      !/"level":40/.test(
        lg
          .split("\n")
          .filter((l) => /Unsplash|KORA_MODEL|KORA_SECRETS|AI provider/.test(l))
          .join("\n"),
      ),
    );
    step("API /health", (await health(apiUrl))?.status === "ok");
    step("Site Host /health", !!(await health(hostUrl)));
    const claim = await (await fetch(`${apiUrl}/__kora`)).json();
    step(
      "runtime claim answers",
      !!claim.schema,
      `${claim.service} ${claim.environment}`,
    );
    const idx = await fetch(`${apiUrl}/`);
    const html = await idx.text();
    step(
      "the web application is served by the API process",
      idx.status === 200 &&
        /<div id="root"|<script[^>]+type="module"/.test(html),
    );
    const asset = html.match(/(?:src|href)="(\/assets\/[^"]+\.js)"/)?.[1];
    step(
      "a built web asset is served",
      !!asset && (await fetch(apiUrl + asset)).status === 200,
      asset ?? "",
    );
    const me = await fetch(`${apiUrl}/api/auth/me`);
    step("unauthenticated /api/auth/me is refused", me.status === 401);
    // service-to-service: the API's publisher points at the Site Host; a published site is served by the Site Host from the shared DB
    const c = client(apiUrl);
    await c.call("POST", "/api/auth/login", {
      email: state.v7.email,
      password: "correct horse battery",
    });
    const legacy = (await c.call("GET", `/api/sites/${state.legacy.siteId}`))
      .json.data;
    step(
      "legacy site is visible to its owner on the new release, status unchanged",
      legacy.status === "PUBLISHED" &&
        legacy.publishedVersionId === state.legacy.publishedVersionId,
      legacy.status,
    );
    const vers =
      (await c.call("GET", `/api/sites/${state.legacy.siteId}/versions`)).json
        ?.data ?? [];
    step(
      "legacy version history is intact",
      vers.length >= 1,
      `${vers.length} versions`,
    );
    const inbox =
      (await c.call("GET", `/api/sites/${state.legacy.siteId}/forms`)).json
        ?.data ?? [];
    step(
      "the enquiry stored before the upgrade is in the owner's inbox",
      inbox.some((s) => /before the upgrade/.test(JSON.stringify(s))),
      `${inbox.length} enquiries`,
    );
    const pub = legacy.publicUrl;
    const page = pub ? await fetch(pub) : null;
    step(
      "legacy published site is served by the Site Host on the new release",
      !!page && page.status === 200,
      pub ?? "no publicUrl",
    );
    const spec = (
      await c.call(
        "GET",
        `/api/sites/${state.legacy.siteId}/versions/${state.legacy.publishedVersionId}`,
      )
    ).json.data.spec;
    step(
      "legacy spec is still a version 2 design (never converted)",
      spec.version === 2,
    );
    await stopProc(live.api);
  }

  // ---------------------------------------------------------------------------------------------------------------- 4
  if (want("4")) {
    R.setPhase(
      "4 existing v7 commissioning (monitoring, controlled failure and recovery, brand OS) against this release: flag v3 then flag back to v2",
    );
    if (!live.host || live.host.exited)
      step("site host (this release) starts", await startHost("site-host-p4"));
    for (const [phase, flag] of [
      ["v3", "v3"],
      ["rollback", "v2"],
    ]) {
      const ok = await startApi(`api-v7-${phase}`, {
        KORA_CREATIVE_ENGINE: flag,
      });
      step(`API up with KORA_CREATIVE_ENGINE=${flag}`, ok);
      const r = spawnSync(
        "node",
        [
          "scripts/commission-v7.mjs",
          apiUrl,
          phase,
          "--state",
          path.join(outDir, "v7-state.json"),
          "--site-host",
          hostUrl,
          "--out",
          path.join(outDir, `v7-${phase}.json`),
        ],
        { cwd: repo, encoding: "utf8", timeout: 400_000 },
      );
      fs.writeFileSync(
        path.join(outDir, `v7-${phase}.log`),
        r.stdout + r.stderr,
      );
      const pass = (r.stdout.match(/^PASS/gm) ?? []).length,
        fail = r.stdout.match(/^FAIL.*/gm) ?? [];
      step(
        `commission-v7 ${phase}: ${pass} checks passed, ${fail.length} failed`,
        r.status === 0 && fail.length === 0,
        fail.slice(0, 3).join(" | "),
      );
      await stopProc(live.api);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------- 5
  if (want("5")) {
    R.setPhase("5 vNext journeys against the running services");
    ctx5 = {
      R,
      outDir,
      svcLogs,
      stackEnv,
      startApi,
      startHost,
      live,
      apiUrl,
      hostUrl,
      sql,
      state,
      SECRETS,
    };
    await runJourneys(ctx5);
  }
  // ---------------------------------------------------------------------------------------------------------------- 6
  if (want("6")) {
    R.setPhase(
      "6 browser acceptance against two running API instances (v2 and v3 defaults) and one Site Host, one shared database",
    );
    if (!live.host || live.host.exited)
      step("site host starts", await startHost("site-host-p6"));
    const v3ok = await startApi("api-p6-v3", {
      KORA_CREATIVE_ENGINE: "v3",
      KORA_MEDIA_UNSPLASH: "off",
      KORA_MODEL_COMPOSE: "false",
    });
    const API2 = 3320;
    live.api2 = startProc(
      svcLogs,
      "api-p6-v2",
      ["apps/api/dist/server.js"],
      stackEnv({
        API_PORT: String(API2),
        KORA_PUBLIC_URL: `http://127.0.0.1:${API2}`,
        MONITOR_HEALTH_URL: `http://127.0.0.1:${API2}/health`,
        KORA_AUTO_MIGRATE: "false",
      }),
      repo,
    ); // both instances monitor in this test-only layout; hosted staging runs ONE instance (docs/runbooks/site-host.md, "Single instance")
    const v2ok = !!(await until(
      () => health(`http://127.0.0.1:${API2}`),
      80,
      500,
    ));
    step(
      "two API instances (v3 on 3310, default engine on 3320) and one Site Host run against one database",
      v3ok && v2ok,
    );
    const stFile = path.join(outDir, "journeys-state.json");
    if (fs.existsSync(stFile)) {
      const b = spawnSync(
        "node",
        ["scripts/commission/browser.mjs", outDir, stFile, apiUrl, hostUrl],
        { cwd: repo, encoding: "utf8", timeout: 900_000 },
      );
      fs.writeFileSync(path.join(outDir, "browser.log"), b.stdout + b.stderr);
      const br = fs.existsSync(path.join(outDir, "browser-results.json"))
        ? JSON.parse(
            fs.readFileSync(path.join(outDir, "browser-results.json"), "utf8"),
          ).steps
        : [];
      for (const x of br) step(x.name, x.ok, x.detail, "real");
      if (!br.length)
        step(
          "browser checks of published sites ran",
          false,
          b.stderr.slice(0, 200),
        );
    } else
      step(
        "browser checks of published sites (needs phase 5 state)",
        false,
        "journeys-state.json missing",
      );
    const pw = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "-c",
        "scripts/commission/playwright.live.config.ts",
        "--trace",
        "off",
      ],
      {
        cwd: repo,
        encoding: "utf8",
        timeout: 1_800_000,
        env: {
          ...process.env,
          E2E_PORT: String(API2),
          E2E_V3_PORT: String(API),
          DATABASE_URL: DB_URL,
        },
      },
    );
    fs.writeFileSync(
      path.join(outDir, "playwright-live.log"),
      pw.stdout + pw.stderr,
    );
    const summary =
      (pw.stdout.match(/\n\s*(\d+ passed[^\n]*)/) ?? [])[1] ?? "no summary";
    const failedPw = (pw.stdout.match(/\n\s*(\d+ failed)/) ?? [])[1];
    step(
      `repository Playwright suite against the running services: ${summary}${failedPw ? ", " + failedPw : ""}`,
      pw.status === 0,
      `exit ${pw.status}`,
    );
    await stopProc(live.api2);
    await stopProc(live.api);
  }
  // ---------------------------------------------------------------------------------------------------------------- 7
  if (want("7")) {
    R.setPhase(
      "7 rollback compatibility: the PREVIOUS release (e2b62df) run on the migrated database that this release has written to",
    );
    await stopProc(live.api2).catch(() => {});
    await stopProc(live.api).catch(() => {});
    await stopProc(live.host).catch(() => {});
    const jf = path.join(outDir, "journeys-state.json");
    const js = fs.existsSync(jf)
      ? JSON.parse(fs.readFileSync(jf, "utf8"))
      : null;
    const deleted =
      await sql`SELECT id, name FROM sites WHERE deleted_at IS NOT NULL`;
    const nowDeleted = deleted.length;
    const confirmations = Number(
      (await sql`SELECT count(*)::int AS n FROM owner_confirmations`)[0].n,
    );
    const v3versions = Number(
      (
        await sql`SELECT count(*)::int AS n FROM site_versions WHERE (spec->>'version')::int = 3`
      )[0].n,
    );
    const released = Number(
      (
        await sql`SELECT count(*)::int AS n FROM domains WHERE state='RELEASED'`
      )[0].n,
    );
    step(
      "the database holds what only this release writes: soft-deleted sites, v3 designs, owner confirmations",
      nowDeleted >= 1 && confirmations >= 1 && v3versions >= 1,
      `${nowDeleted} soft-deleted sites, ${v3versions} v3 versions, ${confirmations} owner confirmations, ${released} released domains (custom-domain retirement is covered by the integration tests, not exercised here)`,
    );
    step(
      "previous-release Site Host starts on the migrated database",
      await startHost("rollback-old-site-host", baseDir),
    );
    step(
      "previous-release API starts on the migrated database (new tables and columns are simply ignored)",
      await startApi(
        "rollback-old-api",
        { KORA_CREATIVE_ENGINE: "v2" },
        baseDir,
      ),
    );
    const c = client(apiUrl);
    const li = await c.call("POST", "/api/auth/login", {
      email: js?.A.email ?? state.v7.email,
      password: "correct horse battery",
    });
    step(
      "owner logs in on the previous release",
      li.status === 200,
      String(li.status),
    );
    if (js) {
      const sites = await c.call("GET", "/api/sites");
      step(
        "previous release lists the owner's sites, including those made by this release",
        sites.status === 200 &&
          (sites.json?.data ?? []).some((x) => x.id === js.siteIds.kochab),
        String(sites.status),
      );
      const vs = await c.call(
        "GET",
        `/api/sites/${js.siteIds.kochab}/versions`,
      );
      step(
        "previous release lists versions of a site made by this release",
        vs.status === 200 && (vs.json?.data?.length ?? 0) >= 1,
        String(vs.status),
      );
      const v0 = vs.json?.data?.[0]?.id;
      const one = v0
        ? await c.call("GET", `/api/sites/${js.siteIds.kochab}/versions/${v0}`)
        : { status: 0 };
      step(
        "previous release opens a vNext version (new optional fields tolerated, no 500)",
        one.status < 500 && one.status !== 0,
        String(one.status),
      );
      for (const k of ["kochab", "barber"]) {
        const r = await fetch(js.urls[k]);
        step(
          `previous Site Host still serves the published ${k} site made by this release (immutable bytes)`,
          r.status === 200,
          String(r.status),
        );
      }
      const bk = await fetch(js.urls.bakery);
      step(
        "previous Site Host serves the restored-and-republished bakery site",
        bk.status === 200,
        String(bk.status),
      );
      const gone = deleted[0]
        ? await sql`SELECT id FROM sites WHERE id=${deleted[0].id}`
        : [];
      step(
        "a site deleted under this release is not served by the previous Site Host (deletion sets UNPUBLISHED)",
        gone.length === 1 &&
          (await sql`SELECT status FROM sites WHERE id=${deleted[0].id}`)[0]
            .status !== "PUBLISHED",
      );
      const fm = await client(apiUrl).call(
        "POST",
        `/api/public/sites/${js.siteIds.bakery}/forms`,
        {
          name: "Rollback Visitor",
          message: "Enquiry while running the previous release",
        },
        { anonymous: true },
      );
      step(
        "a visitor enquiry is accepted by the previous release",
        fm.status === 201,
        String(fm.status),
      );
      const ib =
        (await c.call("GET", `/api/sites/${js.siteIds.bakery}/forms`)).json
          ?.data ?? [];
      step(
        "the previous release shows both the enquiry made under this release and the new one",
        ib.some((x) => JSON.stringify(x).includes("Saturday")) &&
          ib.some((x) => JSON.stringify(x).includes("Rollback Visitor")),
        `${ib.length} enquiries`,
      );
      const me = await c.call("GET", "/api/auth/me");
      const ns = await c.call("POST", "/api/sites", {
        orgId: js.A.orgId,
        name: "Created on the previous release",
      });
      step(
        "the previous release can still create a site on the migrated schema (allowance may refuse; no server error)",
        ns.status < 500,
        String(ns.status),
      );
      void me;
    }
    const legacy = await fetch(state.legacy.publicUrl);
    step(
      "the legacy v2 site made before the upgrade serves on the previous release",
      legacy.status === 200,
      String(legacy.status),
    );
    await stopProc(live.api);
    await stopProc(live.host);
    step(
      "roll forward: this release starts again on the same database after the rollback",
      (await startHost("rollforward-site-host")) &&
        (await startApi("rollforward-api", {
          KORA_CREATIVE_ENGINE: "v3",
          KORA_MEDIA_UNSPLASH: "off",
          KORA_MODEL_COMPOSE: "false",
        })),
    );
    if (js) {
      const c2 = client(apiUrl);
      await c2.call("POST", "/api/auth/login", {
        email: js.A.email,
        password: "correct horse battery",
      });
      const ib2 =
        (await c2.call("GET", `/api/sites/${js.siteIds.bakery}/forms`)).json
          ?.data ?? [];
      step(
        "after roll-forward the enquiry made during the rollback is still there",
        ib2.some((x) => JSON.stringify(x).includes("Rollback Visitor")),
      );
      const sp = await c2.call("GET", `/api/sites/${js.siteIds.bakery}`);
      step(
        "after roll-forward the bakery site is intact and published",
        sp.json?.data?.status === "PUBLISHED",
      );
    }
  }
  // ---------------------------------------------------------------------------------------------------------------- 8
  if (want("8")) {
    R.setPhase(
      "8 deployment order: a new Site Host on a database that has not been migrated yet",
    );
    const r = spawnSync("node", ["scripts/commission/ordering.mjs", outDir], {
      cwd: repo,
      encoding: "utf8",
      timeout: 180_000,
    });
    try {
      for (const x of JSON.parse(r.stdout.trim().split("\n").pop()).steps)
        step(x.name, x.ok, x.detail);
    } catch {
      step("ordering rehearsal ran", false, (r.stderr || r.stdout).slice(-200));
    }
  }

  // ---------------------------------------------------------------------------------------------------------------- 9
  if (want("9")) {
    R.setPhase(
      "9 production-image CONTENTS: services run from a tree built only from the Dockerfile COPY list, NODE_ENV=production (no Docker daemon here: the image itself is not built)",
    );
    const r = spawnSync(
      "node",
      ["scripts/commission/image-contents.mjs", outDir],
      { cwd: repo, encoding: "utf8", timeout: 900_000 },
    );
    try {
      const out = JSON.parse(r.stdout.trim().split("\n").pop());
      for (const x of out.steps) step(x.name, x.ok, x.detail);
      state.imageSizes = out.sizes;
      saveState();
    } catch {
      step(
        "image-contents rehearsal ran",
        false,
        (r.stderr || r.stdout).slice(-200),
      );
    }
  }

  // ---------------------------------------------------------------------------------------------------------------- 10
  if (want("10")) {
    R.setPhase(
      "10 resources observed on this machine (memory and load: one API + one Site Host, separate throwaway database)",
    );
    const r = spawnSync("node", ["scripts/commission/load.mjs", outDir], {
      cwd: repo,
      encoding: "utf8",
      timeout: 300_000,
    });
    let load = null;
    try {
      load = JSON.parse(
        fs.readFileSync(path.join(outDir, "load-results.json"), "utf8"),
      );
    } catch {
      /* reported below */
    }
    step(
      "load and memory measurement ran with no request errors",
      !!load && load.siteHostLoad.errors === 0 && load.apiLoad.errors === 0,
      load
        ? `peak RSS api ${load.peakRssMB.api} MB, site host ${load.peakRssMB.siteHost} MB; site host ${load.siteHostLoad.reqPerSec} req/s p95 ${load.siteHostLoad.p95ms} ms`
        : (r.stderr || r.stdout).slice(-200),
    );
    const dbSize = (
      await sql`SELECT pg_database_size(current_database()) AS b`
    )[0].b;
    const tables =
      await sql`SELECT relname, pg_total_relation_size(c.oid) AS b FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY b DESC LIMIT 6`;
    const vers = (
      await sql`SELECT count(*)::int AS n, coalesce(round(avg(pg_column_size(artifact) + pg_column_size(spec)))::int,0) AS avg_bytes_spec_plus_artifact FROM site_versions`
    )[0];
    fs.writeFileSync(
      path.join(outDir, "resources.json"),
      JSON.stringify(
        {
          databaseBytes: Number(dbSize),
          largestTables: tables.map((t) => ({
            table: t.relname,
            bytes: Number(t.b),
          })),
          siteVersions: vers,
          imageTree: state.imageSizes ?? null,
          host: {
            cpus: os.cpus().length,
            totalMemMB: Math.round(os.totalmem() / 1048576),
          },
        },
        null,
        2,
      ),
    );
    step(
      "storage measurements recorded",
      true,
      `database ${Math.round(Number(dbSize) / 1048576)} MB with ${vers.n} site versions`,
    );
  }
} catch (e) {
  step(
    "commissioning aborted by an unexpected error",
    false,
    e.stack?.split("\n").slice(0, 3).join(" "),
  );
} finally {
  await ctx5?.fakes?.fakeUnsplash.close().catch(() => {});
  await ctx5?.fakes?.fakeLlm.close().catch(() => {});
  await stopProc(live.api2).catch(() => {});
  await stopProc(live.api).catch(() => {});
  await stopProc(live.host).catch(() => {});
  await sql?.end().catch(() => {});
  fs.writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), steps: R.steps },
      null,
      2,
    ),
  );
  const failed = R.steps.filter((s) => !s.ok);
  const byKind = R.steps.reduce(
    (a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a),
    {},
  );
  console.log(
    `\n${R.steps.length} checks, ${failed.length} failed; by kind: ${JSON.stringify(byKind)}`,
  );
  for (const f of failed)
    console.log(`FAILED [${f.phase}] ${f.name} ${f.detail}`);
  R.close();
  process.exitCode = failed.length ? 1 : 0;
}
