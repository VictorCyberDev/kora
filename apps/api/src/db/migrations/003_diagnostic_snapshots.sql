CREATE TABLE IF NOT EXISTS diagnostic_snapshots (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  UNIQUE(incident_id, content_hash)
);

CREATE INDEX IF NOT EXISTS diagnostic_snapshots_incident_time_idx
  ON diagnostic_snapshots(incident_id, created_at DESC, id);

CREATE OR REPLACE FUNCTION prevent_diagnostic_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'diagnostic snapshots are immutable: % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS diagnostic_snapshots_immutable_update ON diagnostic_snapshots;
DROP TRIGGER IF EXISTS diagnostic_snapshots_immutable_delete ON diagnostic_snapshots;

CREATE TRIGGER diagnostic_snapshots_immutable_update
BEFORE UPDATE ON diagnostic_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_diagnostic_snapshot_mutation();

CREATE TRIGGER diagnostic_snapshots_immutable_delete
BEFORE DELETE ON diagnostic_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_diagnostic_snapshot_mutation();
