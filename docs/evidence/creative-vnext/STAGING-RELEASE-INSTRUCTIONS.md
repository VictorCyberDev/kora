# Staging release instructions

**Nothing here has been run against a shared environment.** These are the steps for a human who has authorised a staging
release of branch `claude/eloquent-turing-38283b`. Do not merge, do not deploy to production, and do not change production
secrets as part of this.

## 0. Preconditions

- A staging database that is a copy or fresh (not production). Take a backup first.
- Review the diff against `e2b62df` and `SECURITY-REVIEW.md`, `KNOWN-LIMITATIONS.md`.

## 1. Migrations (additive; staging only)

Apply `028`, `029`, `030` in order through the normal migration runner (see `MIGRATION-PLAN.md`). Migrations run before the
deploy; old code ignores the new columns and tables.

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

1. Deploy API, web and site-host from the branch.
2. Run `scripts/commission-v7.mjs` (existing commissioning script).
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

Roll back (see `ROLLBACK-PLAN.md`) if any generated page fails the gate in production data, if the site-host serves a deleted
site, or if provider quota use exceeds the reserve.
