-- Content calendar, approvals and the publishing engine.
CREATE TABLE IF NOT EXISTS calendar_items (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  campaign_id uuid,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  caption jsonb NOT NULL DEFAULT '{"headline":"","body":"","cta":"","hashtags":[]}',
  asset_id uuid,
  channels text[] NOT NULL DEFAULT '{}',
  scheduled_for timestamptz,
  state text NOT NULL DEFAULT 'IDEA' CHECK (state IN ('IDEA','DRAFT','APPROVAL_NEEDED','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','PARTIALLY_PUBLISHED','CANCELLED')),
  approved_hash text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT calendar_items_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE,
  CONSTRAINT calendar_items_asset_fk FOREIGN KEY (asset_id, site_id) REFERENCES media_assets(id, site_id)
);
CREATE INDEX IF NOT EXISTS calendar_items_site_time_idx ON calendar_items(site_id, scheduled_for);

-- Append-only record of what was approved (by content hash), by whom, under which policy.
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  item_id uuid NOT NULL,
  content_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED','REVOKED')),
  decided_by uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approvals_item_fk FOREIGN KEY (item_id, site_id) REFERENCES calendar_items(id, site_id) ON DELETE CASCADE,
  CONSTRAINT approvals_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'approvals_immutable') THEN
    CREATE TRIGGER approvals_immutable BEFORE UPDATE ON approvals FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;

-- One job per (item, channel). The idempotency key is derived from the approved content, so a retry can never
-- create a second post.
CREATE TABLE IF NOT EXISTS publish_jobs (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','PUBLISHING','PUBLISHED','FAILED','CANCELLED')),
  idempotency_key text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  due_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  method text CHECK (method IN ('LIVE','SANDBOX','MANUAL')),
  external_id text,
  external_url text,
  error text,
  error_class text CHECK (error_class IN ('RETRYABLE','PERMANENT','UNCERTAIN')),
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, provider),
  CONSTRAINT publish_jobs_item_fk FOREIGN KEY (item_id, site_id) REFERENCES calendar_items(id, site_id) ON DELETE CASCADE,
  CONSTRAINT publish_jobs_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS publish_jobs_due_idx ON publish_jobs(due_at, next_attempt_at) WHERE state = 'QUEUED';

CREATE TABLE IF NOT EXISTS publish_attempts (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES publish_jobs(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  outcome text NOT NULL DEFAULT 'STARTED' CHECK (outcome IN ('STARTED','SUCCEEDED','FAILED')),
  http_status integer,
  detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS publish_attempts_job_idx ON publish_attempts(job_id, attempt);
