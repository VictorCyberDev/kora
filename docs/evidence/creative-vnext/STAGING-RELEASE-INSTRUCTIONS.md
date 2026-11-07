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

| Variable                                                                                                   | Required | Purpose                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KORA_SECRETS_KEY`                                                                                         | yes      | Existing key. Media candidate/selection tokens are HMAC-signed with a key derived from it; no new secret is introduced.                                       |
| `KORA_CREATIVE_ENGINE=v3`                                                                                  | yes      | Enables the Business Blueprint engine for new generations. Unset or `v2` restores the previous behaviour.                                                     |
| `KORA_MEDIA_UNSPLASH=on`                                                                                   | optional | Leave **off** until the operator has configured the key and accepted the caching decision in `MEDIA-COMPLIANCE.md`. The bundled catalogue works without it.   |
| `UNSPLASH_ACCESS_KEY`, `UNSPLASH_APP_NAME`, `UNSPLASH_RATE_LIMIT`, `UNSPLASH_RESERVE`, `UNSPLASH_API_BASE` | optional | Backend only. The key is never sent to a browser or a model. Defaults: demo allowance of 50 requests/hour with a reserve kept back.                           |
| `KORA_MODEL_COMPOSE=on`                                                                                    | optional | Enables one model call per generation to redraft copy (uses the already configured AI provider). Everything it writes passes the fact validator and the gate. |

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
