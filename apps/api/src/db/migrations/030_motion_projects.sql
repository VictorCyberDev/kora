-- Editable motion sources are revisioned separately from immutable render outputs.
-- Existing motion_renders rows remain valid legacy jobs.
CREATE TABLE IF NOT EXISTS motion_projects (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  timeline_version integer NOT NULL CHECK (timeline_version >= 1),
  source jsonb NOT NULL,
  brand_kit_version integer NOT NULL CHECK (brand_kit_version > 0),
  brand_os_version integer,
  brand_os_hash text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  render_status text NOT NULL DEFAULT 'IDLE'
    CHECK (render_status IN ('IDLE','QUEUED','RENDERING','READY','FAILED')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  UNIQUE (id, site_id, org_id),
  CONSTRAINT motion_projects_site_org_fk
    FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE,
  CONSTRAINT motion_projects_brand_os_pair
    CHECK ((brand_os_version IS NULL AND brand_os_hash IS NULL)
      OR (brand_os_version IS NOT NULL AND brand_os_hash ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX IF NOT EXISTS motion_projects_site_idx
  ON motion_projects(site_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS motion_project_revisions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  timeline_version integer NOT NULL CHECK (timeline_version >= 1),
  source jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision),
  CONSTRAINT motion_project_revisions_project_fk
    FOREIGN KEY (project_id, site_id, org_id)
    REFERENCES motion_projects(id, site_id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS motion_project_revisions_project_idx
  ON motion_project_revisions(project_id, revision DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'motion_project_revisions_immutable') THEN
    CREATE TRIGGER motion_project_revisions_immutable
      BEFORE UPDATE OR DELETE ON motion_project_revisions
      FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;

ALTER TABLE motion_renders ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE motion_renders ADD COLUMN IF NOT EXISTS project_revision integer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'motion_renders_project_fk'
  ) THEN
    ALTER TABLE motion_renders ADD CONSTRAINT motion_renders_project_fk
      FOREIGN KEY (project_id, site_id)
      REFERENCES motion_projects(id, site_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS motion_exports (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  project_revision integer NOT NULL CHECK (project_revision > 0),
  render_id uuid NOT NULL REFERENCES motion_renders(id),
  asset_id uuid,
  status text NOT NULL
    CHECK (status IN ('QUEUED','RENDERING','READY','FAILED')),
  error text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (render_id),
  CONSTRAINT motion_exports_project_fk
    FOREIGN KEY (project_id, site_id, org_id)
    REFERENCES motion_projects(id, site_id, org_id) ON DELETE CASCADE,
  CONSTRAINT motion_exports_asset_fk
    FOREIGN KEY (asset_id, site_id) REFERENCES media_assets(id, site_id)
);
CREATE INDEX IF NOT EXISTS motion_exports_project_idx
  ON motion_exports(project_id, created_at DESC);
