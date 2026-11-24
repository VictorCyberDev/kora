-- Tenant-owned or explicitly licensed audio for motion projects. The original
-- bytes are private and are only read by the render worker.
CREATE TABLE IF NOT EXISTS motion_audio (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  mime text NOT NULL CHECK (mime IN ('audio/mpeg','audio/wav','audio/ogg')),
  bytes bytea NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 20971520),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  license_kind text NOT NULL CHECK (license_kind IN ('user-supplied','licensed')),
  rights_confirmed_at timestamptz NOT NULL,
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (id, site_id),
  CONSTRAINT motion_audio_site_org_fk
    FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS motion_audio_site_idx
  ON motion_audio(site_id, created_at DESC) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS motion_audio_dedupe_idx
  ON motion_audio(site_id, sha256) WHERE removed_at IS NULL;
