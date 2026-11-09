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

## Rehearsed locally (commissioning phase 7) and what it showed

The previous release (`e2b62df`) was run on the database this release had written to (migrations 028-030 applied, soft-deleted sites,
vNext designs, owner confirmations). Results, all passing (LOCAL-COMMISSIONING-REPORT.md):

- It started and migrated cleanly; its own `KORA_AUTO_MIGRATE=true` re-ran migrations up to 027 on the migrated database without harm.
- It accepted logins, listed the owner's sites (including those made by this release), listed and opened vNext versions without a server error,
  accepted new visitor enquiries and showed both old and new enquiries.
- The previous Site Host served every site this release had published (immutable bytes) and did **not** serve a site deleted under this release.
- It refused a site over the plan allowance with 402, not a server error.
- Rolling forward again on the same database worked, and the enquiry made during the rollback was still there.

Order of response (least to most invasive): (1) set the release switches back: `KORA_CREATIVE_ENGINE=v2`, `KORA_MEDIA_UNSPLASH=off`,
`KORA_MODEL_COMPOSE=false` (exact syntax in CONFIGURATION.md), no deploy needed; (2) redeploy the previous image for the control plane, then the
Site Host if needed; (3) only if required, and with approval, the schema steps above. **Do not roll the schema back** to make a code rollback work: it is not required.

Things the rehearsal does not cover: a rollback on RumptyCloud itself (platform redeploy behaviour), and custom-domain re-attachment
after a restore (manual).
