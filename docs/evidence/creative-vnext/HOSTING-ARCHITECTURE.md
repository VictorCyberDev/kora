# Hosting architecture and minimum configuration (evidence-based)

Question asked: does Kora need three separate hosted application deployments, or does its architecture genuinely support two?
Short answer: **it needs two application deployments plus one PostgreSQL database.** The third process in the repository
(`demo-service`) is not part of the product that customers use, and the two that are cannot be merged without losing
isolation that the design, and its tests, depend on. Everything below says how it was established.

## The processes in the repository

One Docker image (root `Dockerfile`) contains three start commands.

| #   | Process                       | Command                                 | What it does                                                                                                                                                                                                     | Needed for the creative engine? |
| --- | ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | **Control plane (API + web)** | `node apps/api/dist/server.js`          | The REST API, **and** the built web application (`apps/web/dist`, served by the same process from `apps/api/src/platform/index.ts`), generation, editor, publishing, per-site monitors, incident engine, billing | **Yes**                         |
| 2   | **Site Host**                 | `node apps/site-host/dist/server.js`    | Serves published customer sites from immutable artifacts in the database; no sessions, billing, credentials or API (`apps/site-host/src/app.ts` header; tested)                                                  | **Yes**                         |
| 3   | demo-service                  | `node apps/demo-service/dist/server.js` | The original demo workload that the single-service incident demo monitors; needs no database                                                                                                                     | **No**                          |

So "web application" is **not** a separate deployment: it is a build output served by process 1. There is no separate web
server, no queue, no worker and no object store: PostgreSQL is the only stateful dependency (owner photos are stored in the
database; published artifacts are rows in `site_versions`).

### Why `demo-service` can be dropped (evidence)

- Per-site monitoring (the monitoring of customer sites that this release relies on) is started by `platform.startBackground()`
  whenever `MONITOR_ENABLED=true`; it observes Site Host URLs, not `demo-service` (`apps/api/src/server.ts`).
- The older single-service monitor is a separate switch: `KORA_LEGACY_MONITOR=false` turns it off (exact string `false`;
  it is read directly from the environment, not by the config parser). With `demo-service` absent and the default
  `MONITOR_HEALTH_URL`, that monitor would poll a closed port and open incidents for "demo-service".
- The commissioning rehearsal ran every creative, publishing, monitoring, controlled-failure and recovery check with
  `MONITOR_HEALTH_URL` pointed at the API's own `/health` and **no demo-service process at all** (`commissioning/results.json`,
  phases 3-7: 0 failures; `commission-v7` v3 phase 32 checks, rollback phase 8 checks).
- What is lost: the legacy "monitor the demo service" walkthrough (`docs/runbooks/rumpty-deploy.md`). It is not required to
  release the creative engine, and `docs/runbooks/site-host.md` already describes the production layout as exactly
  database + control plane + Site Host.

### Why the Site Host must not be merged into the control plane (evidence)

Merging would fit two slots by removing one, but it would weaken three things the release relies on. Point 1 has a
test and a measured case behind it; points 2 and 3 are design reasoning (the first is also what the existing runbook states),
not something this rehearsal measured.

1. **Failure and rollback isolation.** Customer sites keep serving while the control plane restarts, redeploys, rolls back or
   crash-loops. This rehearsal produced a concrete case: an invalid release switch ends the API at startup (exit 78,
   `commissioning` phase 5 and `config.test.ts`). If the API served customer sites, a mistyped switch would take every
   published site offline. With the Site Host separate, the rollback rehearsal (phase 7) showed the previous release's API
   starting on the migrated database while sites kept serving, and the new Site Host serving sites made by the new
   release. `apps/api/src/site-host.integration.test.ts` asserts that a Site Host crash does not stop the control plane
   and that recovery works across the service boundary.
2. **The observer must not be the observed.** Kora's monitoring and verified recovery check a site "from outside". Putting the
   monitor in the same process as what it monitors makes a crash invisible to the thing that should detect it.
3. **Trust boundary.** The Site Host holds no session secrets, billing, provider credentials or remediation authority and
   exposes only health, claim and site content (asserted in `site-host.integration.test.ts`). Customer-authored pages served
   from the control plane's origin would share an origin with session cookies.

A smaller, reversible alternative was considered and rejected for now: running the Site Host inside the API process behind a
flag. It would save one slot and lose all three properties above.

## Minimum hosted configuration

| Resource                                    | Count | Notes                                                                              |
| ------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| Application deployment: control plane + web | 1     | one instance only (see below); readiness path `/health`                            |
| Application deployment: Site Host           | 1     | one instance only; readiness path `/health` (now 503 until the schema is migrated) |
| PostgreSQL                                  | 1     | one database shared by both; the account needs DDL for migrations                  |
| Object storage / queue / cache              | 0     | none are used                                                                      |

**One instance of each**, per `docs/runbooks/site-host.md`: rate limiters and per-site monitors live in process memory. (The
vNext media quota, candidate cache and selections are shared through the database, so they are consistent across instances,
but monitors are not; the rehearsal's two-instance layout was for testing only.)

### Memory and CPU (measured on this machine; hosted hardware will differ)

`scripts/commission/load.mjs`, one API and one Site Host on loopback, 4 vCPU (`commissioning/load-results.json`):

| Measure                                                                                                                                         | API (control plane + web)            | Site Host                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Resident memory at idle after start                                                                                                             | 132 MB                               | 90 MB                                              |
| Peak resident memory (3 sites generated and published; then 79,540 requests at concurrency 20 against the Site Host and 52,027 against the API) | 163 MB                               | 185 MB                                             |
| Site Host throughput / latency under that load                                                                                                  | n/a                                  | about 3,977 req/s, p95 9.8 ms, 0 errors (loopback) |
| Generate + publish one site (3 averaged)                                                                                                        | about 125 ms in total, no model call | n/a                                                |

Minimum I would configure: **512 MB per application deployment** (about three times the measured peak of 185 MB, for headroom
and Node's heap growth), **0.25 vCPU or more** (generation is milliseconds of CPU; it is bursty), and Postgres with
**1 GB of storage** to start. These are sizing recommendations from one machine, not measured on RumptyCloud.

### Storage (measured)

| Item                                                                                | Size                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Database after the full rehearsal (56 site versions plus event and monitoring rows) | 26 MB                                                                                                                                |
| One site version (spec + artifact, average)                                         | about 30 KB                                                                                                                          |
| Owner photographs                                                                   | stored in the database (resized variants); the rehearsal's few uploads were about 1.6 MB; this grows with use                        |
| Runtime tree assembled from the Dockerfile's COPY list                              | 102 MB (81 MB `node_modules`, 6 MB bundled photographs, 1.3 MB web app, 3.8 MB API code)                                             |
| Image on disk                                                                       | **not measured**: no Docker daemon here. Add the Node 22 slim base to the 102 MB tree: expect roughly 300 MB uncompressed (estimate) |

Build-artifact storage: each deployment built from the root `Dockerfile` produces its own image of roughly that size. Whether the
platform lets two deployments share one build is **not known from this work** and must be checked in the RumptyCloud console;
if it cannot, the two-deployment layout needs two image builds of about the same size. Do not drop the Site Host to save
that.

## Required migration sequence

Evidence: `commissioning` phases 1, 2, 7, 8.

1. Create the database. Take a backup (hosted).
2. Run the migrations **once, before either application takes traffic**: `node apps/api/dist/db/migrate.js` with the database's
   own connection string. That script applies the files in order without a lock, so run it once; every file is re-runnable. (The
   API's `KORA_AUTO_MIGRATE=true` path does take an advisory lock.) On the rehearsal data they
   took 4 ms (028), 8 ms (029) and 27 ms (030), and left every row in place; running them a second time changed nothing.
3. Deploy the **Site Host** next. It needs only the database. **Measured:** a new Site Host started on a database that had
   not yet been migrated answered `/health` with the database "ok" and then failed every site request with
   `column "deleted_at" does not exist`. That was a real release hazard; it is fixed here: readiness now returns 503
   (`schema: "outdated"`) until migration 028 has run, so a platform holds traffic back.
4. Deploy the **control plane**. With `KORA_AUTO_MIGRATE=true` it also applies migrations at startup, but do not rely on that for
   the first rollout of 028-030: the Site Host should not start first against an old schema.
5. Then, and only then, flip release switches one at a time (see CONFIGURATION.md): engine `v3`; later Unsplash and model
   composition after their external validation.

Rollback order is the reverse of risk, not of this list: set the switches back first (no deploy); redeploy the previous
image only if needed. The previous release was run on the migrated database in the rehearsal (phase 7) and worked,
including with its own auto-migrate on.

## Required environment variables

See CONFIGURATION.md for the table per process and the exact syntax of the four release switches. In short: both processes need
`DATABASE_URL` and `SITE_HOST_PUBLIC_URL`; the control plane also needs `NODE_ENV=production`, `KORA_PUBLIC_URL`,
`KORA_SECRETS_KEY` (32 random bytes, base64: now validated at startup), and either `KORA_LEGACY_MONITOR=false` or a
`MONITOR_HEALTH_URL` that points at something that exists. Do not set `PORT`/`API_PORT` on a platform that injects `PORT`.

## What still requires RumptyCloud (cannot be shown locally)

1. The Docker image builds from the root `Dockerfile` on the platform, runs as the non-root `node` user, and fits the build-artifact storage.
2. The deployments' readiness checks and the platform's own restart behaviour (including that a 503 from the Site Host before migration is respected).
3. The platform-injected `PORT`, internal and public database connection strings (`sslmode`), and the platform's TLS and proxy hop (`KORA_TRUST_PROXY`, secure cookies).
4. The public https origin for owner pictures (`KORA_MEDIA_PUBLIC_URL`): locally it is a placeholder, and the owner-photo route was exercised on the local address only.
5. Real memory and CPU limits of the chosen plan (the sizing above is from a 16 GB, 4 vCPU machine).
6. Cold start / sleeping behaviour of a free plan (`docs/runbooks/go-live.md` says the app sleeps when idle) and what that does to per-site monitors.
7. The deployed commit's identity (`/__kora`) and the existing commissioning script and live checks run against the hosted URLs.
