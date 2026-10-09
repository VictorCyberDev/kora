CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY, name text NOT NULL UNIQUE, health_url text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telemetry_observations (
  id uuid PRIMARY KEY, service_id uuid NOT NULL REFERENCES services(id), observed_at timestamptz NOT NULL, healthy boolean NOT NULL,
  http_status integer, latency_ms integer NOT NULL CHECK (latency_ms >= 0), timed_out boolean NOT NULL DEFAULT false,
  failure_reason text, failure_category text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telemetry_service_time_idx ON telemetry_observations(service_id, observed_at DESC);
CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY, service_id uuid NOT NULL REFERENCES services(id), deduplication_key text NOT NULL, state text NOT NULL,
  severity text NOT NULL, started_at timestamptz NOT NULL, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_incident_per_key ON incidents(deduplication_key) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS incident_evidence (
  id uuid PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, observation_id uuid NOT NULL REFERENCES telemetry_observations(id),
  evidence_kind text NOT NULL CHECK (evidence_kind IN ('trigger','ongoing','recovery')), threshold_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(incident_id, observation_id)
);
CREATE TABLE IF NOT EXISTS domain_events (
  event_id uuid PRIMARY KEY, event_type text NOT NULL, schema_version integer NOT NULL, occurred_at timestamptz NOT NULL, source text NOT NULL,
  service_id uuid REFERENCES services(id), correlation_id uuid, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_correlation_idx ON domain_events(correlation_id, occurred_at);
CREATE TABLE IF NOT EXISTS service_dependencies (
  service_id uuid NOT NULL REFERENCES services(id), depends_on_service_id uuid NOT NULL REFERENCES services(id), relationship text NOT NULL DEFAULT 'depends_on',
  PRIMARY KEY(service_id, depends_on_service_id), CHECK(service_id <> depends_on_service_id)
);
