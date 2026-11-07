-- Safe website deletion. Additive only: two nullable columns and a partial index; no data is changed or removed.
-- A deleted site keeps its row (versions are immutable and cannot be deleted by design) so history, audit records and
-- any enquiries it received are preserved. `deleted_at` hides it from the account and from the plan allowance; the
-- site is also set to UNPUBLISHED in the same transaction, which is what the Site Host reads to stop serving it.
-- Rollback: `ALTER TABLE sites DROP COLUMN deleted_by, DROP COLUMN deleted_at;` (after restoring any deleted rows' state).
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS sites_org_active_idx ON sites(org_id) WHERE deleted_at IS NULL;
