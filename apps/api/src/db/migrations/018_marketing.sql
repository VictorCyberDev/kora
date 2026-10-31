-- Marketing agent recommendations (with their evidence), growth brief snapshots and campaign bundles.
CREATE TABLE IF NOT EXISTS marketing_recommendations (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  dedupe_key text NOT NULL,
  rule text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACCEPTED','DISMISSED','RESOLVED')),
  dismissed_until timestamptz,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  result jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, dedupe_key),
  UNIQUE (id, site_id),
  CONSTRAINT marketing_recommendations_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS recommendation_evidence (
  id uuid PRIMARY KEY,
  recommendation_id uuid NOT NULL,
  site_id uuid NOT NULL,
  label text NOT NULL,
  value text NOT NULL,
  source text NOT NULL,
  CONSTRAINT recommendation_evidence_rec_fk FOREIGN KEY (recommendation_id, site_id) REFERENCES marketing_recommendations(id, site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS recommendation_evidence_idx ON recommendation_evidence(recommendation_id);

-- A brief is a frozen snapshot of what Kora measured for a period, so it can be audited later.
CREATE TABLE IF NOT EXISTS growth_briefs (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  numbers jsonb NOT NULL,
  brief jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, period_start, period_end),
  CONSTRAINT growth_briefs_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'growth_briefs_immutable') THEN
    CREATE TRIGGER growth_briefs_immutable BEFORE UPDATE ON growth_briefs FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  objective text NOT NULL,
  offer_id text NOT NULL,
  offer_title text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED')),
  brand_version integer NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT campaigns_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS campaign_channels (
  campaign_id uuid NOT NULL,
  site_id uuid NOT NULL,
  provider text NOT NULL,
  asset_id uuid,
  PRIMARY KEY (campaign_id, provider),
  CONSTRAINT campaign_channels_campaign_fk FOREIGN KEY (campaign_id, site_id) REFERENCES campaigns(id, site_id) ON DELETE CASCADE,
  CONSTRAINT campaign_channels_asset_fk FOREIGN KEY (asset_id, site_id) REFERENCES media_assets(id, site_id)
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_items_campaign_fk') THEN
    ALTER TABLE calendar_items ADD CONSTRAINT calendar_items_campaign_fk FOREIGN KEY (campaign_id, site_id) REFERENCES campaigns(id, site_id);
  END IF;
END $$;
