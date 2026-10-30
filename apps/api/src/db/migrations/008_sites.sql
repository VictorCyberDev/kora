-- Kora Sites: sites, immutable versions, jobs, form submissions.
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHING','PUBLISHED','FAILED','UNPUBLISHED')),
  public_url text,
  current_version_id uuid,
  published_version_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_org_idx ON sites(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_versions (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id),
  number integer NOT NULL CHECK (number >= 1),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','READY','PUBLISHED','SUPERSEDED','FAILED')),
  spec jsonb NOT NULL,
  spec_hash text NOT NULL,
  artifact_hash text NOT NULL,
  artifact jsonb NOT NULL,
  generation_source text NOT NULL CHECK (generation_source IN ('MODEL','DETERMINISTIC','EDIT_MODEL','EDIT_STRUCTURED','MANUAL')),
  build_status text NOT NULL DEFAULT 'BUILT' CHECK (build_status IN ('BUILT','FAILED')),
  publish_status text NOT NULL DEFAULT 'NOT_PUBLISHED' CHECK (publish_status IN ('NOT_PUBLISHED','PUBLISHING','PUBLISHED','FAILED')),
  parent_version_id uuid REFERENCES site_versions(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (site_id, number)
);
CREATE INDEX IF NOT EXISTS site_versions_site_idx ON site_versions(site_id, number DESC);

-- A version's content is immutable; only lifecycle columns may change.
CREATE OR REPLACE FUNCTION kora_site_version_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site versions cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.number IS DISTINCT FROM OLD.number OR NEW.spec IS DISTINCT FROM OLD.spec OR NEW.spec_hash IS DISTINCT FROM OLD.spec_hash
     OR NEW.artifact IS DISTINCT FROM OLD.artifact OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash
     OR NEW.generation_source IS DISTINCT FROM OLD.generation_source OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'site version content is immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS site_versions_immutable ON site_versions;
CREATE TRIGGER site_versions_immutable BEFORE UPDATE OR DELETE ON site_versions
  FOR EACH ROW EXECUTE FUNCTION kora_site_version_immutable();

CREATE TABLE IF NOT EXISTS site_generation_jobs (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('GENERATE','EDIT')),
  prompt text NOT NULL,
  status text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  source text NOT NULL,
  result_version_id uuid REFERENCES site_versions(id),
  error text,
  input_tokens integer,
  output_tokens integer,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_publish_jobs (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id),
  version_id uuid NOT NULL REFERENCES site_versions(id),
  publisher text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PUBLISH','REPUBLISH','ROLLBACK','UNPUBLISH')),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS publish_jobs_site_idx ON site_publish_jobs(site_id, started_at DESC);

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id),
  fields jsonb NOT NULL,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','READ','ARCHIVED')),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_submissions_site_idx ON form_submissions(site_id, submitted_at DESC);

ALTER TABLE services ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id);
ALTER TABLE services ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
CREATE UNIQUE INDEX IF NOT EXISTS services_site_unique ON services(site_id) WHERE site_id IS NOT NULL;
