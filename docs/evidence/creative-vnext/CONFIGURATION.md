# Release configuration reference (authoritative syntax)

Source of truth is the parser, `apps/api/src/platform/config.ts` (`FLAG_SYNTAX`). The test
`apps/api/src/platform/config.test.ts` fails if any document, `.env.example` or script in this repository shows a value for
these switches that the parser rejects. Values are exact and lowercase; nothing is guessed (`on`, `1`, `yes` and `TRUE` are **not**
accepted for a `true`/`false` switch). An empty or whitespace-only value counts as unset; surrounding whitespace is trimmed.

## The four release switches

| Variable               | Accepted values | Default / unset | What it does                                                                                                                     | Needs                                                                                                              |
| ---------------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `KORA_CREATIVE_ENGINE` | `v2`, `v3`      | `v2`            | Engine for **new** designs (`v3` = Business Blueprint engine). Existing sites are never converted.                               | For owner pictures in designs: `KORA_MEDIA_PUBLIC_URL` (or `KORA_PUBLIC_URL`) `https://…`                          |
| `KORA_MEDIA_UNSPLASH`  | `on`, `off`     | off             | Enables owner-mediated Unsplash search/selection. The bundled photo catalogue works without it.                                  | `UNSPLASH_ACCESS_KEY`, `UNSPLASH_APP_NAME`, `KORA_SECRETS_KEY` (all three, or the provider reports NOT_CONFIGURED) |
| `KORA_MODEL_COMPOSE`   | `true`, `false` | `false`         | One bounded model call per v3 generation redrafts page copy; every edit is validated and the deterministic site is the fallback. | A configured AI provider (`AI_*` or `INFERENCE_*`); otherwise it does nothing and a startup warning says so        |
| `KORA_COPY_ASSIST`     | `true`, `false` | `false`         | Pre-existing: a model may propose the opening headline.                                                                          | A configured AI provider                                                                                           |

The other `KORA_*` booleans (`KORA_COOKIE_SECURE`, `KORA_TRUST_PROXY`, `KORA_SIGNUP_ENABLED`, `KORA_CHAOS_ENABLED`,
`KORA_LEGACY_PUBLIC_API`, `KORA_SANDBOX_CHANNELS`, `KORA_EXPERIMENTAL_RUMPTY_BUCKET`) also take exactly `true` or `false`.
`KORA_AUTO_MIGRATE` is read directly and means "run migrations at startup" only when exactly `true`.
`KORA_LEGACY_MONITOR` is also read directly: the original single-service demo monitor is switched **off only by the exact string
`false`** (anything else leaves it on). Set it to `false` when `demo-service` is not deployed, or point `MONITOR_HEALTH_URL` at
something that exists; otherwise that monitor polls a closed port. Per-site monitors are unaffected by it and start whenever
`MONITOR_ENABLED=true`.

`KORA_SECRETS_KEY` must be 32 random bytes, base64 encoded (`openssl rand -base64 32`). It is validated at startup, before the
database is touched; an invalid key ends the process with exit status 78 and a message that never prints the key.

## Readiness and ordering

The Site Host's `/health` returns 503 with `{"status":"degraded","database":"ok","schema":"outdated"}` while the database lacks the
columns this release reads (migration 028). It returns 200 with `schema: "ok"` once the migrations have run. Run migrations before
either application takes traffic (HOSTING-ARCHITECTURE.md, "Required migration sequence").

## What happens with a wrong value

The API validates these switches **before connecting to the database or running migrations**. An invalid value ends the process
with exit status 78 (EX_CONFIG) and a message such as:

```
Invalid Kora configuration:
  - KORA_MODEL_COMPOSE: must be exactly "true" or "false" (or unset)
```

The message names the variable and the accepted values and never repeats the offending value (it may be a mistyped secret).
A platform that restarts a failing deployment will therefore show a crash loop with that message in its first log line, not
a half-migrated database. Switches that are valid but would do nothing (for example `KORA_MODEL_COMPOSE=true` with no AI
provider) start normally and log one warning per mismatch; a `release switches` line states the effective state of each.

## Documented values by environment

| Stage                                    | `KORA_CREATIVE_ENGINE` | `KORA_MEDIA_UNSPLASH` | `KORA_MODEL_COMPOSE` |
| ---------------------------------------- | ---------------------- | --------------------- | -------------------- |
| Production today (unchanged)             | unset (`v2`)           | unset                 | unset                |
| Staging, first deploy                    | `v3`                   | `off` (or unset)      | `false` (or unset)   |
| Staging, after real-key check            | `v3`                   | `on` + its three vars | `false`              |
| Staging, after reading real model output | `v3`                   | as above              | `true` + AI provider |
| Rollback                                 | `v2`                   | `off`                 | `false`              |

## Environment variables per service (names only; never commit values)

| Service (process)                                      | Required                                                                                                                                             | Optional / tuning                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Kora API + web app (`node apps/api/dist/server.js`)    | `DATABASE_URL`, `NODE_ENV=production`, `KORA_PUBLIC_URL`, `SITE_HOST_PUBLIC_URL`, `KORA_SECRETS_KEY` (32 random bytes, base64), `MONITOR_HEALTH_URL` | `KORA_AUTO_MIGRATE=true`, `KORA_MEDIA_PUBLIC_URL`, the four switches above, `AI_*`/`INFERENCE_*`, `UNSPLASH_*`, `MONITOR_*`, `LOG_LEVEL` |
| Site Host (`node apps/site-host/dist/server.js`)       | `DATABASE_URL` (same database), `SITE_HOST_PUBLIC_URL`                                                                                               | `PORT`/`SITE_HOST_PORT`, `SITE_HOST_HOST`, `LOG_LEVEL`, `SITE_HOST_FAULT_DELAY_MS` (fault injection; leave unset)                        |
| demo-service (`node apps/demo-service/dist/server.js`) | none (no database)                                                                                                                                   | `KORA_ENVIRONMENT`; **not deployed for the creative engine** (HOSTING-ARCHITECTURE.md); then set `KORA_LEGACY_MONITOR=false`             |

Do not set `API_PORT` or `PORT` on a platform that injects `PORT` (see `docs/runbooks/rumpty-deploy.md`).
