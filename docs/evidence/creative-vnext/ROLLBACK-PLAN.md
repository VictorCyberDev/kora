# Rollback plan

1. **Behaviour:** set `KORA_CREATIVE_ENGINE=v2` (or unset). New generations return to v2; existing v3 sites keep serving
   from their immutable artifacts. Published artifacts are bytes in `site_versions`; nothing in this change rewrites them.
2. **Code:** redeploy the previous commit (`e2b62df`). Migrations 028/029 are additive: the old code ignores the new
   columns/table, so no schema rollback is needed to roll code back.
3. **Deleted sites:** if the deletion feature must be withdrawn after use, restore with
   `UPDATE sites SET deleted_at=NULL, deleted_by=NULL WHERE id = ...` (status stays `UNPUBLISHED`; republish through the
   normal flow). The audit rows (`site.deleted`) are immutable history and stay.
4. **Schema (only if required):** `ALTER TABLE sites DROP COLUMN deleted_by, DROP COLUMN deleted_at;`
   `DROP TABLE media_provider_quota;` Both are disposable once the feature is off. Not to be run without approval.
5. Existing recovery (bad release → approval → rollback → verified recovery) is untouched and still the first response
   to a bad published version.
