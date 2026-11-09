# Migration plan

Three new migrations, all additive and idempotent. None deletes or rewrites existing rows.
**None has been applied to any shared, staging or production database** (forbidden by the release boundary); they were
applied only to isolated local `_test` databases.

| #   | File                                           | Change                                                                                                                                                                                                         | Risk                                                                                                                                                                     |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 028 | `028_site_deletion.sql`                        | `sites.deleted_at timestamptz`, `sites.deleted_by uuid REFERENCES users`, partial index on `org_id WHERE deleted_at IS NULL`                                                                                   | none for existing rows (NULL = not deleted); small index build                                                                                                           |
| 029 | `029_media_provider_quota.sql`                 | table `media_provider_quota`                                                                                                                                                                                   | none; unused unless the Unsplash provider is switched on                                                                                                                 |
| 030 | `030_retirement_confirmations_media_state.sql` | widen `domains.state` CHECK to allow `RELEASED`; tables `owner_confirmations` (append-only trigger), `media_rate_counters`, `media_candidate_cache`, `media_selections`; nullable `form_submissions.erased_at` | the CHECK is dropped and re-added inside one statement block (brief `ACCESS EXCLUSIVE` on `domains`, which is a small table); all else is new tables / a nullable column |

Verified locally: the repository's migration integration test (order, byte-stability, upgrade from an older schema) passes
with all three files; the full suite runs against a database migrated from empty. **Not done:** a rehearsal on a
production-sized dataset, and any application to a shared database.

Order of rollout (when authorised): run migrations first (old code ignores the new columns/tables and the widened CHECK), then
deploy. Plan-allowance behaviour changes only once a site has been deleted. `KORA_CREATIVE_ENGINE=v3` is what exposes the new
generation; sites already generated are untouched and are never converted.

Compatibility: existing SiteSpecs parse unchanged (new fields are optional); a spec with 8 pages still parses and renders;
a one-page spec still renders and is not failed by the new-generation gate. Old `site_versions` are immutable and keep serving.

## Rehearsal results (local, disposable `_test` database; commissioning phase 2)

Starting from the previous release's schema with a published site, a version and a visitor enquiry in place:

| Migration | Time  | Objects absent before | Present after | Second application | Rows lost or added |
| --------- | ----- | --------------------- | ------------- | ------------------ | ------------------ |
| 028       | 4 ms  | yes                   | yes           | no-op              | none               |
| 029       | 8 ms  | yes                   | yes           | no-op              | none               |
| 030       | 27 ms | yes                   | yes           | no-op              | none               |

Also checked: existing sites read `deleted_at` NULL; `owner_confirmations` rejects UPDATE and DELETE; `domains.state` accepts `RELEASED`; the production runner
completes over all 30 files and leaves the row counts unchanged. These timings are on an almost empty database; they say the statements are metadata-only, not
how long they take on production-sized tables (not rehearsed).

**Sequence (evidence: commissioning phase 8):** run the migrations once, before either application takes traffic, then the Site Host, then the control plane.
A new Site Host started before 028 failed every site request while reporting its database healthy; it now reports 503 (`schema: "outdated"`) until the migrations have run.
