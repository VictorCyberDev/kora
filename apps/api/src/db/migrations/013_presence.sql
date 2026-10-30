-- Presence layer: the factual business profile, its revisions, the brand kit and presence checks.
-- Every table is org-scoped and, where it names a site, uses the (site_id, org_id) composite key so a
-- row can never point at another organization's site.

CREATE TABLE IF NOT EXISTS business_profiles (
  site_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  facts jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_profiles_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_profiles_org_idx ON business_profiles(org_id);

-- Append-only history of what the owner said and when, so any fact can be traced.
CREATE TABLE IF NOT EXISTS business_profile_revisions (
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  revision integer NOT NULL CHECK (revision >= 1),
  facts jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('OWNER','SITE_IMPORT','SYSTEM')),
  changed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, revision),
  CONSTRAINT business_profile_revisions_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);

-- A brand kit version is immutable: published assets reference a version, and changing the kit creates a new one.
CREATE TABLE IF NOT EXISTS brand_kits (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version >= 1),
  kit jsonb NOT NULL,
  origin text NOT NULL CHECK (origin IN ('DERIVED','OWNER')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, version),
  CONSTRAINT brand_kits_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS brand_kits_site_idx ON brand_kits(site_id, version DESC);

CREATE OR REPLACE FUNCTION kora_immutable_rows() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brand_kits_immutable') THEN
    CREATE TRIGGER brand_kits_immutable BEFORE UPDATE ON brand_kits FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'business_profile_revisions_immutable') THEN
    CREATE TRIGGER business_profile_revisions_immutable BEFORE UPDATE ON business_profile_revisions FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;

-- One run of the presence checks, kept so owners can see what changed since last time.
CREATE TABLE IF NOT EXISTS presence_checks (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  profile_revision integer,
  brand_version integer,
  counts jsonb NOT NULL,
  headline text NOT NULL,
  checks jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_checks_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS presence_checks_site_idx ON presence_checks(site_id, created_at DESC);

-- Open and resolved issues derived from checks; the same issue id is reused while it stays open.
CREATE TABLE IF NOT EXISTS presence_issues (
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  check_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('FAIL','WARN','UNKNOWN')),
  detail jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (site_id, check_id, first_seen_at),
  CONSTRAINT presence_issues_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS presence_issues_open_unique ON presence_issues(site_id, check_id) WHERE resolved_at IS NULL;
