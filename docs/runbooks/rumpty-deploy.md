# Deploying Kora on Rumpty Cloud

Two Web Service deployments from one GitHub repository and the root `Dockerfile`: **kora-api** and **demo-service**. This runbook lists console settings and environment variable **names only**. Never put a secret value in this repository, a commit, a ticket or a start command.

Sources: Rumpty docs `deployments/ports`, `deployments/create-a-deployment`, `deployments/github-deploy` and `databases/connecting`. Where those docs are silent this runbook says so instead of guessing.

## Platform facts the image relies on

- The platform injects `PORT`; the **Port** setting always wins over any `PORT` you set yourself. The default Port is `8080`.
- The app must bind `0.0.0.0` (a localhost-only listener is invisible to health checks). Both servers do by default.
- The **readiness path** must return a successful response without authentication. Use `/health` on both services.
- Environment variables are injected at **runtime only**, not during the build, and are stored as secrets.
- The deployment filesystem is wiped on every deploy. Kora keeps no local state; PostgreSQL is the system of record.
- Do not put `PORT=...` in a start command (it runs in a shell and would override the injected value). Change the **Port** setting instead.

## Image

The root `Dockerfile` is a multi-stage pnpm build (`--frozen-lockfile`) that compiles the whole workspace and ships production dependencies only, as the non-root `node` user, with no secrets. The default command is the API; a deployment overrides it with its start command:

| Deployment   | Start command                            |
| ------------ | ---------------------------------------- |
| kora-api     | `node apps/api/dist/server.js` (default) |
| demo-service | `node apps/demo-service/dist/server.js`  |

The Rumpty docs I read do not document the console's start-command field (only that it exists and runs in a shell). Check the field name in the console; if a deployment has no start command set, the image default (the API) runs, which is wrong for demo-service.

## Console settings (both deployments)

| Setting        | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Type           | Web Service / Backend                                      |
| Source         | this GitHub repository, the branch you deploy              |
| Build method   | Dockerfile (repo root `Dockerfile`)                        |
| Port           | `8080`                                                     |
| Readiness path | `/health`                                                  |
| Auto deploy    | your choice (default on: every push to the branch deploys) |

## Commit identity (`GET /__kora`)

Both services answer `GET /__kora` with `kora.runtime-claim/v1` (service, environment, commit, commitSource, builtAt, startedAt, uptimeSeconds). The commit comes from, in order: the image's `build-info.json`, then `KORA_COMMIT_SHA`, else `null` / `unavailable`.

- With a Dockerfile build from GitHub the build context normally contains `.git`, and the image records its `HEAD`. If the platform's build context has no `.git`, set the build argument `GIT_SHA` (40 hex characters; not a secret) if the console offers build arguments. The docs I read do not say whether it does.
- Environment variables are runtime-only on Rumpty, so `KORA_COMMIT_SHA` can only describe the running deployment, not the build. Set it to the deployed commit only if you maintain it by hand; if it is unset and the build recorded nothing, the claim says `unavailable`. A wrong value here is a wrong claim.
- Never treat this as proof of what is running (see ADR-009).

## Environment variables (names only)

**kora-api**

- `DATABASE_URL`: PostgreSQL connection string (see the next section).
- `NODE_ENV`: `production`.
- `MONITOR_HEALTH_URL`: the demo-service health URL the monitor polls, for example `<demo-service URL>/health`. The docs I read do not describe deployment-to-deployment internal URLs; use the URL the console shows for demo-service.
- `MONITOR_SERVICE_NAME`: for example `demo-service`.
- `KORA_ENVIRONMENT`: for example `production` or `demo`. Also reported by `/__kora`.
- Optional: `KORA_COMMIT_SHA` (see above).
- Optional provider binding, **all four or none**: `RUMPTY_WORKSPACE`, `RUMPTY_REGION`, `RUMPTY_RESOURCE_TYPE` (`virtual_machine` or `deployment`), `RUMPTY_RESOURCE_ID`; plus the display-only `RUMPTY_RESOURCE_NAME`. A partial binding is rejected at startup.
- Optional tuning: `MONITOR_ENABLED`, `MONITOR_INTERVAL_MS`, `MONITOR_TIMEOUT_MS`, `MONITOR_FAILURE_THRESHOLD`, `MONITOR_RECOVERY_THRESHOLD`, `LOG_LEVEL`.
- Do **not** set `API_PORT` or `PORT`. The API reads `API_PORT`, then the platform `PORT`, then `3000`; setting `API_PORT` would override the Port setting and break routing.

**demo-service**

- `NODE_ENV`: `production`.
- `KORA_ENVIRONMENT`: reported by `/__kora` (default `development`).
- Optional: `KORA_COMMIT_SHA` (see above).
- Leave `DEMO_FAILURE_INJECTION_ENABLED` unset (it defaults to `false`; `/dev/failure` and `/dev/recover` then return 404). Enable it only for a controlled incident demo.
- Do **not** set `DEMO_PORT` or `PORT` (same reason; it reads `DEMO_PORT`, then `PORT`, then `3100`).
- It needs no database and no `DATABASE_URL`.

## Database connection strings

Per the Rumpty docs (`databases/connecting`): apps deployed in the same workspace should use the database's **internal** connection string; the **public** endpoint is for clients outside the cluster, requires TLS, and its string ends in `?sslmode=require`. Copy the string from the console as-is. Set `DATABASE_URL` under the deployment's environment variables before the first build, as documented.

| Use                                 | String                     |
| ----------------------------------- | -------------------------- |
| kora-api running on Rumpty          | internal connection string |
| `pnpm db:migrate` from your machine | public connection string   |

### Running migrations once

The API does not migrate on start. Run the migrations once per database, and again after any release that adds a migration (they are written to be re-runnable). From a checkout, with the **public** string supplied through your shell's secret handling (never typed into a committed file):

```bash
pnpm install --frozen-lockfile
DATABASE_URL="<public connection string ending in ?sslmode=require>" pnpm db:migrate
```

Expected output: `Applied 001_initial.sql` through the latest migration. (`DROP ... IF EXISTS` notices are harmless.) The image can run the same step with `node apps/api/dist/db/migrate.js`, with `DATABASE_URL` set to the internal string, if you prefer to run it from a deployment shell.

### sslmode and the `postgres` driver

Kora uses the `postgres` (postgres.js) driver, not `pg`. Verified locally against a TLS-enabled PostgreSQL 16 with a self-signed certificate:

| URL suffix             | Result                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| none                   | connects **without** TLS (`ssl=false`)                             |
| `?sslmode=require`     | connects **with** TLS 1.3, certificate not verified (`ssl=true`)   |
| `?sslmode=verify-full` | fails with `DEPTH_ZERO_SELF_SIGNED_CERT` unless the CA is supplied |

Rumpty documents that each database has its own self-signed certificate and that `sslmode=require` encrypts without checking it, so `?sslmode=require` is the right setting for the public endpoint. The Rumpty note that Node `pg` treats `sslmode=require` as full verification does **not** apply to this driver. `pnpm db:migrate` through `?sslmode=require` was run end to end against that server. The unit tests in `apps/api/src/db/tls.test.ts` pin the option mapping.

Manual live check against any TLS PostgreSQL (read-only `SELECT`, skipped unless the variable is set):

```bash
KORA_TLS_DATABASE_URL="<connection string ending in ?sslmode=require>" \
  pnpm --filter @kora/api exec vitest run src/db/tls.test.ts
```

Never point the test suite's `DATABASE_URL` at a real database: the suite is destructive and refuses any database whose name does not end in `_test`.

## Smoke-test checklist

After both deployments are Active:

1. demo-service: `GET <demo URL>/health` returns `200` and `{"status":"healthy"}`.
2. kora-api: `GET <api URL>/health` returns `200` and `{"status":"ok"}`. This is a liveness check and does not query the database.
3. `GET <demo URL>/__kora` and `GET <api URL>/__kora` return `kora.runtime-claim/v1` with the expected `service` and `environment`; `commit` matches what you deployed or says `unavailable`.
4. `GET <api URL>/services` lists the monitored service (and its provider resource when the `RUMPTY_*` binding is set).
5. Wait two monitor intervals; `GET <api URL>/incidents` is empty while demo-service is healthy.
6. Check the Runtime Logs of kora-api for `Server listening` on the Port and no repeated `monitor iteration failed`.
7. Optional, demo only: enable `DEMO_FAILURE_INJECTION_ENABLED=true` on demo-service, redeploy, `POST /dev/failure`, and watch an incident open after the failure threshold and resolve after `POST /dev/recover` plus the recovery threshold. Turn the flag off afterwards.

## Known limits

- The API is unauthenticated, including `POST /incidents/:id/diagnosis/snapshots`. Hosted-demo mitigation: **none yet**. Do not store real tenant data until authentication exists (see `docs/security/threat-model.md`).
- `GET /__kora` is a self-reported runtime claim (ADR-009), not proof or attestation. Rumpty documents no such endpoint; the shape is defined by Kora.
- The image build and container start could not be run where this was authored (no Docker). CI now builds the root Dockerfile on every pull request (job `docker image`) in three situations (context with `.git`, `GIT_SHA` build argument, no `.git` and no argument), starts containers, and checks `/health`, `/__kora`, the non-root user and the in-image migration.
