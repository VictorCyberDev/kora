# Migration plan

Two new migrations, both additive and idempotent (`IF NOT EXISTS`); neither deletes, rewrites or locks existing data beyond
a metadata-only `ADD COLUMN` of nullable columns.

| #   | File                           | Change                                                                                                                       | Risk                                                              |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 028 | `028_site_deletion.sql`        | `sites.deleted_at timestamptz`, `sites.deleted_by uuid REFERENCES users`, partial index on `org_id WHERE deleted_at IS NULL` | none for existing rows (NULL = not deleted); index build is small |
| 029 | `029_media_provider_quota.sql` | new table `media_provider_quota`                                                                                             | none; unused unless the Unsplash provider is switched on          |

Verified locally: the repository's migration integration test (order, byte-stability, upgrade from 024, schema) passes
with both files; the full suite runs against a database migrated from empty. **Not done:** applying to any production or
staging database (forbidden by the release boundary), and a rehearsal on a production-sized dataset.

Order of rollout (when authorised): deploy code that tolerates the columns missing is **not** provided, so run migrations
first (they are additive, old code ignores the new columns), then deploy. Plan-allowance behaviour changes only once a site
has been deleted. The v3 creative flag (`KORA_CREATIVE_ENGINE=v3`) is what exposes the new generation; sites already
generated are untouched and are never converted.

Compatibility: existing SiteSpecs parse unchanged (new fields are optional); a spec with 8 pages still parses and renders;
a one-page spec still renders and is not failed by the new-generation gate.
