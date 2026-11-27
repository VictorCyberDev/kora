-- Original M15: durable, consent-scoped acquisition evidence. A journey is
-- represented by the referral UUID; no email, IP address, user agent or raw
-- share token is stored in this ledger.
CREATE UNIQUE INDEX IF NOT EXISTS acquisition_referrals_id_org_unique
  ON acquisition_referrals(id, org_id);

CREATE TABLE IF NOT EXISTS acquisition_events (
  id uuid PRIMARY KEY,
  referral_id uuid NOT NULL,
  org_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'audit_created','share_created','referral_visit','signup','activation',
    'first_project','first_export','new_share'
  )),
  source_type text NOT NULL CHECK (char_length(source_type) BETWEEN 2 AND 80),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 200),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT acquisition_events_referral_org_fk
    FOREIGN KEY (referral_id, org_id)
    REFERENCES acquisition_referrals(id, org_id) ON DELETE CASCADE,
  UNIQUE (referral_id, stage)
);
CREATE INDEX IF NOT EXISTS acquisition_events_org_time_idx
  ON acquisition_events(org_id, occurred_at DESC);

DROP TRIGGER IF EXISTS acquisition_events_immutable ON acquisition_events;
CREATE TRIGGER acquisition_events_immutable
  BEFORE UPDATE OR DELETE ON acquisition_events
  FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();

-- Capture the first post-consent activation, project and export from the
-- platform's authoritative rows. ON CONFLICT makes retries and concurrent
-- creators idempotent while preserving the earliest observed evidence.
CREATE OR REPLACE FUNCTION record_acquisition_milestone() RETURNS trigger AS $$
DECLARE
  milestone text;
  evidence_type text;
  evidence_id text;
BEGIN
  IF TG_TABLE_NAME = 'business_profiles' THEN
    milestone := 'activation';
    evidence_type := 'business_profile';
    evidence_id := NEW.site_id::text;
  ELSIF TG_TABLE_NAME IN ('site_versions','creative_documents','motion_projects') THEN
    milestone := 'first_project';
    evidence_type := TG_TABLE_NAME;
    evidence_id := NEW.id::text;
  ELSIF TG_TABLE_NAME = 'usage_events' AND NEW.dimension = 'EXPORT' THEN
    milestone := 'first_export';
    evidence_type := 'usage_event';
    evidence_id := NEW.id::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO acquisition_events
    (id, referral_id, org_id, stage, source_type, source_id, occurred_at)
  SELECT gen_random_uuid(), r.id, r.org_id, milestone, evidence_type,
    evidence_id, COALESCE(
      (to_jsonb(NEW)->>'created_at')::timestamptz,
      (to_jsonb(NEW)->>'occurred_at')::timestamptz,
      now()
    )
  FROM acquisition_referrals r
  WHERE r.org_id = NEW.org_id AND r.revoked_at IS NULL
  ON CONFLICT (referral_id, stage) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS acquisition_activation_capture ON business_profiles;
CREATE TRIGGER acquisition_activation_capture
  AFTER INSERT ON business_profiles
  FOR EACH ROW EXECUTE FUNCTION record_acquisition_milestone();

DROP TRIGGER IF EXISTS acquisition_site_project_capture ON site_versions;
CREATE TRIGGER acquisition_site_project_capture
  AFTER INSERT ON site_versions
  FOR EACH ROW EXECUTE FUNCTION record_acquisition_milestone();

DROP TRIGGER IF EXISTS acquisition_document_project_capture ON creative_documents;
CREATE TRIGGER acquisition_document_project_capture
  AFTER INSERT ON creative_documents
  FOR EACH ROW EXECUTE FUNCTION record_acquisition_milestone();

DROP TRIGGER IF EXISTS acquisition_motion_project_capture ON motion_projects;
CREATE TRIGGER acquisition_motion_project_capture
  AFTER INSERT ON motion_projects
  FOR EACH ROW EXECUTE FUNCTION record_acquisition_milestone();

DROP TRIGGER IF EXISTS acquisition_export_capture ON usage_events;
CREATE TRIGGER acquisition_export_capture
  AFTER INSERT ON usage_events
  FOR EACH ROW EXECUTE FUNCTION record_acquisition_milestone();
