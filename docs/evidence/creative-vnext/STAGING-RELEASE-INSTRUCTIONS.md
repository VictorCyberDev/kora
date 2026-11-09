# Staging release instructions

**Nothing here has been run against a shared environment.** These are the steps for a human who has authorised a staging
release of branch `claude/eloquent-turing-38283b`. Do not merge, do not deploy to production, and do not change production
secrets as part of this.

## 0. Preconditions

- A staging database that is a copy or fresh (not production). Take a backup first.
- Review the diff against `e2b62df`, `SECURITY-REVIEW.md`, `KNOWN-LIMITATIONS.md` and `LOCAL-COMMISSIONING-REPORT.md`.
- The local rehearsal has been done (`LOCAL-COMMISSIONING-REPORT.md`): this section is the hosted part that it could not cover.
- **Shape of the stack: two application deployments and one PostgreSQL** (control plane + web app; Site Host). Do **not** deploy
  `demo-service` for this release and set `KORA_LEGACY_MONITOR=false` on the control plane. Reasons and sizing: `HOSTING-ARCHITECTURE.md`.
  Run **one instance** of each.

## 1. Order (evidence: commissioning phase 8)

1. Create the database.
2. Run the migrations **once, before either application takes traffic**: `node apps/api/dist/db/migrate.js` with the database's own
   connection string (`MIGRATION-PLAN.md`; 028, 029, 030 are additive; the script applies the files without a lock, so run it once).
3. Deploy the **Site Host** (it needs only the database). Its readiness path returns 503 until the schema is current.
4. Deploy the **control plane** with the staging values below.
5. Check `/health` on both, `/__kora` on both, and the startup log of the control plane for the `release switches` line and any warning.

## 2. Configuration (names only; set values in the staging secret store, never in the repository)

The exact syntax of every release switch, and what each does, is in `CONFIGURATION.md`; a test keeps that file and this one
consistent with the parser. **Boolean switches take exactly `true` or `false`; the Unsplash switch takes exactly `on` or `off`;
the engine takes exactly `v2` or `v3`.** An invalid value stops the API at startup (exit 78) naming the variable.

| Variable                                                                                                   | Required                | Staging value (first deploy)                   | Purpose                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `KORA_SECRETS_KEY`                                                                                         | yes                     | 32 random bytes, base64 (generate for staging) | Encrypts provider tokens and signs media selection tokens. Use a staging-only key, never the production one.                     |
| `KORA_CREATIVE_ENGINE`                                                                                     | yes                     | `v3`                                           | Enables the Business Blueprint engine for new generations. `v2` or unset restores the previous behaviour.                        |
| `KORA_MEDIA_UNSPLASH`                                                                                      | optional                | `off` (or unset)                               | Leave off until the operator has configured the key and accepted the caching decision in `MEDIA-COMPLIANCE.md`; then `on`.       |
| `UNSPLASH_ACCESS_KEY`, `UNSPLASH_APP_NAME`, `UNSPLASH_RATE_LIMIT`, `UNSPLASH_RESERVE`, `UNSPLASH_API_BASE` | only with Unsplash `on` | unset                                          | Backend only. The key is never sent to a browser or a model. Defaults: 50 requests/hour with a reserve of 10.                    |
| `KORA_MODEL_COMPOSE`                                                                                       | optional                | `false` (or unset)                             | `true` enables one model call per generation (uses the already configured AI provider). **`on` is not valid and stops startup.** |

## 3. Deploy and verify

1. With the order in section 1 done, run `scripts/commission-v7.mjs <control-plane URL> baseline|v3|rollback --site-host <Site Host URL>` (existing script) and, for the vNext journeys, `node scripts/commission/local.mjs` is the local equivalent to read and adapt (it needs local processes; it is not run against hosted URLs as it stands).
2. Record the results of the hosted run next to `LOCAL-COMMISSIONING-REPORT.md`, tagged real or simulated as it does.
3. Generate the Kochab Studio, Sweet Crumbs Bakery ("I bake cakes and small chops.") and "I cut hair." briefs; confirm 6-page
   Kochab, ≥10 bakery photo placements, and a barber site with a single "Haircuts" offering.
4. Open each in the visual editor (Edit website): change a headline, reorder two sections, replace a picture from "Kora
   photos", save, preview on desktop and phone, publish, restore the earlier version.
5. Delete a test site, confirm its public URL stops serving, restore it, republish.
6. If Unsplash was enabled: run one search, select one photo, confirm the credit line and the download-tracking call, and
   read the quota headers. **This is the validation that is still pending.**
7. If model composition was enabled: generate once, read the report, then generate with the provider disabled and confirm
   the full deterministic site still appears.

## 4. Stop conditions

Roll back (see `ROLLBACK-PLAN.md`, which records what the local rollback rehearsal showed) if any generated page fails the gate on staging data, if the Site Host serves a deleted
site, if either readiness check stays red after the migrations have run, or if provider quota use exceeds the reserve.

## 5. Hosted-only acceptance still to be done on RumptyCloud (not shown locally)

The image builds from the root `Dockerfile` and runs as the non-root user; two deployments fit the build-artifact allowance (or the console allows one build to be shared); readiness
checks and restarts behave; TLS, secure cookies and the proxy hop are right; `KORA_MEDIA_PUBLIC_URL` is a public https origin and an owner photo loads from it; the plan's memory
limit holds under a generation (about 185 MB peak measured locally); free-plan sleeping does not break per-site monitors; the commissioning script and live checks pass against the hosted URLs.
Full list: `HOSTING-ARCHITECTURE.md`, "What still requires RumptyCloud".
