-- Generated images and video from open-source models. Provenance is mandatory and nothing is usable until a person approves it.
CREATE TABLE IF NOT EXISTS generated_media (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('image','video')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 120),
  mime text NOT NULL,
  bytes bytea NOT NULL,
  width integer,
  height integer,
  provenance jsonb NOT NULL,
  review text NOT NULL DEFAULT 'UNREVIEWED' CHECK (review IN ('UNREVIEWED','APPROVED','REJECTED')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generated_media_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE,
  CONSTRAINT generated_media_review_who CHECK (review = 'UNREVIEWED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS generated_media_site_idx ON generated_media(site_id, created_at DESC);

-- A customer must agree before Kora suggests messaging them again. Recorded by the owner; never inferred.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS message_consent_at timestamptz;
