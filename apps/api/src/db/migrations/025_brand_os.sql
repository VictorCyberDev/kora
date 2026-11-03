-- Brand OS versions and creative feedback (v7). Both are append-only and tenant-scoped through the site.
-- A Brand OS version records what the brand was when artifacts were made; changing the brand writes version N+1 and
-- never rewrites an earlier one, so an approved flyer keeps pointing at the brand it was created from.
CREATE TABLE IF NOT EXISTS brand_os_versions (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version >= 1),
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  grammar_id text NOT NULL CHECK (char_length(grammar_id) BETWEEN 1 AND 40),
  direction_name text NOT NULL CHECK (char_length(direction_name) BETWEEN 1 AND 60),
  brand_os jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, version),
  CONSTRAINT brand_os_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS brand_os_site_idx ON brand_os_versions(site_id, version DESC);

-- Evidence for taste learning: direction chosen/rejected, regeneration, image rejected, palette or font changed,
-- artifact approved. Kora only claims a learned preference when several events agree; one event is evidence, not taste.
CREATE TABLE IF NOT EXISTS creative_feedback (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('DIRECTION_CHOSEN','DIRECTION_REJECTED','REGENERATED','IMAGE_REJECTED','PALETTE_CHANGED','FONT_CHANGED','ARTIFACT_APPROVED','NUDGE_APPLIED')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 80),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_feedback_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS creative_feedback_site_idx ON creative_feedback(site_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brand_os_versions_immutable') THEN
    CREATE TRIGGER brand_os_versions_immutable BEFORE UPDATE ON brand_os_versions FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'creative_feedback_immutable') THEN
    CREATE TRIGGER creative_feedback_immutable BEFORE UPDATE ON creative_feedback FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;
