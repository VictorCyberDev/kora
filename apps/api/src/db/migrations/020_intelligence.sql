-- Social metrics (raw + normalized), reviews and replies, and tenant-scoped business memory.
CREATE TABLE IF NOT EXISTS social_metrics (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('LIVE','SANDBOX')),
  scope text NOT NULL CHECK (scope IN ('ACCOUNT','POST')),
  external_id text NOT NULL DEFAULT '',
  raw_name text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('impressions','reach','engagements','clicks','followers','profile_views','unmapped')),
  value numeric NOT NULL,
  period_end date NOT NULL,
  raw jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, provider, scope, external_id, raw_name, period_end),
  CONSTRAINT social_metrics_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS social_metrics_site_idx ON social_metrics(site_id, period_end DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('LIVE','SANDBOX','MANUAL')),
  external_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  author text NOT NULL DEFAULT '' CHECK (length(author) <= 120),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 4000),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  sensitive boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','SEEN','REPLIED','DISMISSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, provider, external_id),
  UNIQUE (id, site_id),
  CONSTRAINT reviews_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS review_replies (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  origin text NOT NULL CHECK (origin IN ('SUGGESTED','OWNER')),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','POSTED_BY_OWNER')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_replies_review_fk FOREIGN KEY (review_id, site_id) REFERENCES reviews(id, site_id) ON DELETE CASCADE,
  CONSTRAINT review_replies_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_memory (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('PREFERENCE','FACT','DECISION','OUTCOME')),
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 80),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 500),
  source text NOT NULL CHECK (source IN ('OWNER','SYSTEM')),
  evidence jsonb NOT NULL DEFAULT '{}',
  archived_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_memory_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS business_memory_outcome_unique ON business_memory(site_id, key) WHERE kind = 'OUTCOME';
CREATE INDEX IF NOT EXISTS business_memory_site_idx ON business_memory(site_id, created_at DESC) WHERE archived_at IS NULL;
