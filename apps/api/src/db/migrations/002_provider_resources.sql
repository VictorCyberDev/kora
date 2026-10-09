CREATE TABLE IF NOT EXISTS provider_resources (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  provider_account text NOT NULL,
  region text NOT NULL,
  resource_type text NOT NULL,
  provider_resource_id text NOT NULL,
  display_name text,
  environment text NOT NULL,
  provider_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_account, region, resource_type, provider_resource_id)
);

CREATE TABLE IF NOT EXISTS service_resource_bindings (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES provider_resources(id) ON DELETE RESTRICT,
  relationship text NOT NULL CHECK (relationship IN ('RUNS_ON','EXPOSES','MONITORS','DEPENDS_ON')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(service_id, resource_id, relationship)
);

ALTER TABLE telemetry_observations
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES provider_resources(id),
  ADD COLUMN IF NOT EXISTS provider_status text;

CREATE INDEX IF NOT EXISTS observations_resource_time_idx
  ON telemetry_observations(resource_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS resource_bindings_resource_idx
  ON service_resource_bindings(resource_id);
