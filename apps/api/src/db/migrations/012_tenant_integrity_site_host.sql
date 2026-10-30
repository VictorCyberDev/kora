-- 1. Controlled-test faults expire on their own.
ALTER TABLE site_faults ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes');

-- 2. Domains: DNS, provider routing and TLS are separate facts; ACTIVE needs all three.
ALTER TABLE domains ADD COLUMN IF NOT EXISTS routing_state text NOT NULL DEFAULT 'UNKNOWN'
  CHECK (routing_state IN ('UNKNOWN','CONFIGURED','PROVIDER_ROUTING_UNAVAILABLE'));

-- 3. A row that names both a site and an organization must name the site's own organization.
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_id_org_unique') THEN
    ALTER TABLE sites ADD CONSTRAINT sites_id_org_unique UNIQUE (id, org_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_versions_id_site_unique') THEN
    ALTER TABLE site_versions ADD CONSTRAINT site_versions_id_site_unique UNIQUE (id, site_id);
  END IF;
  FOREACH t IN ARRAY ARRAY['site_versions','site_generation_jobs','site_publish_jobs','form_submissions','domains',
                           'site_provider_bindings','deployment_revisions','notifications','action_proposals','change_events']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_site_org_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE', t, t || '_site_org_fk');
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_site_org_fk') THEN
    ALTER TABLE services ADD CONSTRAINT services_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id);
  END IF;
  -- A fault can only target a version of its own site.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_faults_version_site_fk') THEN
    ALTER TABLE site_faults ADD CONSTRAINT site_faults_version_site_fk FOREIGN KEY (version_id, site_id) REFERENCES site_versions(id, site_id);
  END IF;
END $$;
