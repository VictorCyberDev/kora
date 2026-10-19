-- Verification observations are evidence: once written they must not change.
-- 005 left this to convention; 006 enforces it in the database, mirroring 003
-- (row-level UPDATE and DELETE) and 004 (statement-level TRUNCATE, which does
-- not fire row triggers, also when reached through TRUNCATE services CASCADE).
-- INSERT is untouched. Re-runnable like every migration.
CREATE OR REPLACE FUNCTION prevent_verification_observation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'verification observations are append-only: % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS verification_observations_append_only_update ON verification_observations;
DROP TRIGGER IF EXISTS verification_observations_append_only_delete ON verification_observations;
DROP TRIGGER IF EXISTS verification_observations_append_only_truncate ON verification_observations;

CREATE TRIGGER verification_observations_append_only_update
BEFORE UPDATE ON verification_observations
FOR EACH ROW EXECUTE FUNCTION prevent_verification_observation_mutation();

CREATE TRIGGER verification_observations_append_only_delete
BEFORE DELETE ON verification_observations
FOR EACH ROW EXECUTE FUNCTION prevent_verification_observation_mutation();

CREATE TRIGGER verification_observations_append_only_truncate
BEFORE TRUNCATE ON verification_observations
FOR EACH STATEMENT EXECUTE FUNCTION prevent_verification_observation_mutation();
