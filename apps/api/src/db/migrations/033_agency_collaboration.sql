-- Agency collaboration extends existing organization identity and tenant keys.
CREATE TABLE IF NOT EXISTS site_collaborators (
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('EDITOR','REVIEWER','APPROVER')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id,user_id),
  FOREIGN KEY (site_id,org_id) REFERENCES sites(id,org_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id,user_id) REFERENCES organization_memberships(org_id,user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_reviews (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  object_type text NOT NULL CHECK (object_type IN (
    'creative_document','motion_project','campaign','site_version'
  )),
  object_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'IN_REVIEW' CHECK (status IN (
    'IN_REVIEW','CHANGES_REQUESTED','APPROVED','REJECTED'
  )),
  created_by uuid NOT NULL REFERENCES users(id),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (site_id,org_id) REFERENCES sites(id,org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS asset_reviews_site_idx
  ON asset_reviews(site_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS review_comments (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES asset_reviews(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  anchor jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_comments_review_idx
  ON review_comments(review_id,created_at);

CREATE TABLE IF NOT EXISTS review_events (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES asset_reviews(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id),
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_events_review_idx
  ON review_events(review_id,created_at);

CREATE TABLE IF NOT EXISTS review_preview_shares (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES asset_reviews(id) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER review_comments_immutable
BEFORE UPDATE OR DELETE ON review_comments
FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
CREATE OR REPLACE TRIGGER review_events_immutable
BEFORE UPDATE OR DELETE ON review_events
FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
