-- TRUNCATE does not fire row-level triggers, so 003's UPDATE/DELETE guards did
-- not stop it (directly or via TRUNCATE incidents CASCADE). Reuse the same
-- function from a statement-level trigger. Re-runnable like every migration.
DROP TRIGGER IF EXISTS diagnostic_snapshots_immutable_truncate ON diagnostic_snapshots;

CREATE TRIGGER diagnostic_snapshots_immutable_truncate
BEFORE TRUNCATE ON diagnostic_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION prevent_diagnostic_snapshot_mutation();
