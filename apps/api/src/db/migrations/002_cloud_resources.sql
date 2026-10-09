CREATE TABLE IF NOT EXISTS cloud_resources (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  provider_account text NOT NULL,
  region text NOT NULL,
  resource_type text NOT NULL,
  provider_resource_id text NOT NULL,
  display_name text,
  provider_status text NOT NULL DEFAULT 'unknown',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account, region, resource_type, provider_resource_id)
);
ALTER TABLE services ADD COLUMN IF NOT EXISTS cloud_resource_id uuid REFERENCES cloud_resources(id);
ALTER TABLE telemetry_observations ADD COLUMN IF NOT EXISTS cloud_resource_id uuid REFERENCES cloud_resources(id);
ALTER TABLE telemetry_observations ADD COLUMN IF NOT EXISTS provider_state text;
CREATE INDEX IF NOT EXISTS telemetry_resource_time_idx ON telemetry_observations(cloud_resource_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS topology_edges (
  from_kind text NOT NULL,
  from_id uuid NOT NULL,
  to_kind text NOT NULL,
  to_id uuid NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('hosts','runs','exposes','depends_on','monitors')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(from_kind, from_id, to_kind, to_id, relationship)
);
