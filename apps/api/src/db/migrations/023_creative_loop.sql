-- M13 campaign briefs, M21 taste feedback, M22/M23 public audits, M25 managed requests.
CREATE TABLE IF NOT EXISTS campaign_briefs (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  brief jsonb NOT NULL,
  directions jsonb NOT NULL,
  blocked jsonb NOT NULL DEFAULT '[]',
  chosen_angle text CHECK (chosen_angle IN ('product','moment','people','place')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_briefs_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS campaign_briefs_site_idx ON campaign_briefs(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS taste_feedback (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
  label text NOT NULL CHECK (label IN ('LOVE','LIKE','NEUTRAL','DISLIKE','OFF_BRAND')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  traits text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taste_feedback_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS taste_feedback_site_idx ON taste_feedback(site_id, created_at DESC);

-- Public audits belong to no tenant: anyone may audit a public address. Stored so a share link can show the same result later.
CREATE TABLE IF NOT EXISTS public_audits (
  id uuid PRIMARY KEY,
  url text NOT NULL,
  final_url text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS managed_requests (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 2000),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','IN_PROGRESS','NEEDS_OWNER','DELIVERED','ACCEPTED','CANCELLED')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT managed_requests_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS managed_request_events (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES managed_requests(id) ON DELETE CASCADE,
  event text NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS managed_requests_site_idx ON managed_requests(site_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'taste_feedback_immutable') THEN
    CREATE TRIGGER taste_feedback_immutable BEFORE UPDATE ON taste_feedback FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'managed_request_events_immutable') THEN
    CREATE TRIGGER managed_request_events_immutable BEFORE UPDATE ON managed_request_events FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;
