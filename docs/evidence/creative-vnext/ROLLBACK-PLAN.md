# Rollback plan

1. **Behaviour:** set `KORA_CREATIVE_ENGINE=v2` (or unset). New generations return to v2; existing v3 sites keep serving from
   their immutable artifacts. Published artifacts are bytes in `site_versions`; nothing in this change rewrites them.
   Independent switches: `KORA_MEDIA_UNSPLASH=off` (stock search disappears; the bundled catalogue remains) and
   `KORA_MODEL_COMPOSE=false` (deterministic copy only). Exact syntax: CONFIGURATION.md.
2. **Code:** redeploy the previous commit (`e2b62df`). Migrations 028-030 are additive: the old code ignores the new
   columns/tables, so no schema rollback is needed to roll code back. The one exception to "ignored" is the widened
   `domains.state` CHECK: old code never writes `RELEASED`, and rows already set to `RELEASED` stay unserved by the old Site Host
   only if the old host filters on `ACTIVE/VERIFYING` (it does).
3. **Deleted sites:** if the deletion feature must be withdrawn after use, restore through the application
   (`POST /api/sites/:id/restore`, which re-checks the allowance) or, for operators,
   `UPDATE sites SET deleted_at=NULL, deleted_by=NULL WHERE id = ...` (status stays `UNPUBLISHED`; republish through the
   normal flow). Retired custom domains are `RELEASED` and must be re-attached by the owner (documented limitation). Audit
   rows (`site.deleted`) are immutable history and stay. Enquiries of a deleted site are kept until an owner explicitly erases
   them (`erased_at`); rollback never touches them.
4. **Schema (only if required, needs approval):**
   `DROP TABLE media_selections, media_candidate_cache, media_rate_counters, media_provider_quota;`
   `ALTER TABLE form_submissions DROP COLUMN erased_at;` `ALTER TABLE sites DROP COLUMN deleted_by, DROP COLUMN deleted_at;`
   `owner_confirmations` is an append-only record of human actions: **do not drop it** without a decision about the records.
   Before dropping `erased_at` check no erasure has been recorded, because dropping it would lose that fact.
5. Existing recovery (bad release → approval → rollback → verified recovery) is untouched and still the first response to a
   bad published version.
