-- Content, Brand and Motion Studio. Generated assets are stored as rendered bytes together with the brand kit
-- version they were made with, and are immutable: editing the Brand Kit never changes an existing asset.
CREATE TABLE IF NOT EXISTS content_drafts (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  channel text NOT NULL CHECK (channel IN ('instagram','facebook','whatsapp','tiktok','google_business')),
  goal text NOT NULL,
  payload jsonb NOT NULL,
  issues jsonb NOT NULL DEFAULT '[]',
  source text NOT NULL CHECK (source IN ('model','deterministic','owner')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','DISCARDED')),
  profile_revision integer,
  brand_version integer,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT content_drafts_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS content_drafts_site_idx ON content_drafts(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('IMAGE','VIDEO')),
  format text NOT NULL,
  category text,
  spec jsonb NOT NULL,
  brand_version integer NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/png','image/svg+xml','video/mp4')),
  bytes bytea NOT NULL,
  svg text,
  sha256 text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  duration_ms integer,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT media_assets_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS media_assets_site_idx ON media_assets(site_id, created_at DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'media_assets_immutable') THEN
    CREATE TRIGGER media_assets_immutable BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;

-- Video exports run as queued jobs: QUEUED -> RENDERING -> READY, or FAILED after bounded retries.
CREATE TABLE IF NOT EXISTS motion_renders (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  spec jsonb NOT NULL,
  brand_version integer NOT NULL,
  business_name text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RENDERING','READY','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  asset_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  CONSTRAINT motion_renders_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE,
  CONSTRAINT motion_renders_asset_fk FOREIGN KEY (asset_id, site_id) REFERENCES media_assets(id, site_id)
);
CREATE INDEX IF NOT EXISTS motion_renders_queue_idx ON motion_renders(status, created_at) WHERE status IN ('QUEUED','RENDERING');
