-- Original M16: explicit opt-in commercial-pilot enrollment. Consent is
-- mandatory and never inferred from ownership, existing sites or billing.
-- No payment claim lives in this table: billing must supply verified receipts.
CREATE TABLE IF NOT EXISTS pilot_participants (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  enrolled_by uuid NOT NULL REFERENCES users(id),
  segment text NOT NULL CHECK (segment IN (
    'small_business','freelancer','creative_professional','agency'
  )),
  industry text NOT NULL CHECK (char_length(industry) BETWEEN 2 AND 120),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  consented_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pilot_participants_active_idx
  ON pilot_participants(enrolled_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS pilot_observations (
  id uuid PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES pilot_participants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'enrolled','onboarded','first_project','first_export','first_publication',
    'feedback','exit'
  )),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 3 AND 200),
  observed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(participant_id,kind,source_id)
);
CREATE INDEX IF NOT EXISTS pilot_observations_participant_idx
  ON pilot_observations(participant_id, observed_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='pilot_observations_immutable') THEN
    CREATE TRIGGER pilot_observations_immutable
    BEFORE UPDATE ON pilot_observations
    FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;
