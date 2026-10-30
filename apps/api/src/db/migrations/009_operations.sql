-- Change intelligence, provider bindings, graph, notifications, remediation.
CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  provider text NOT NULL,
  workspace text NOT NULL,
  status text NOT NULL CHECK (status IN ('CONFIGURED','UNVERIFIED','VERIFIED','FAILED')),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, workspace)
);

CREATE TABLE IF NOT EXISTS site_provider_bindings (
  site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  publisher text NOT NULL,
  workspace text,
  resource_id uuid REFERENCES provider_resources(id),
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_revisions (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  provider text NOT NULL,
  resource_id uuid REFERENCES provider_resources(id),
  version_id uuid REFERENCES site_versions(id),
  revision text NOT NULL,
  artifact_hash text,
  status text NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployment_revisions_site_idx ON deployment_revisions(site_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS change_events (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id),
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'VERSION_PUBLISHED','DEPLOYMENT_STARTED','DEPLOYMENT_COMPLETED','DEPLOYMENT_FAILED','DEPLOYMENT_REVISION_CHANGED',
    'CONFIG_CHANGED','DOMAIN_STATUS_CHANGED','DATABASE_BINDING_CHANGED','PROVIDER_RESOURCE_STATE_CHANGED','APPLICATION_VERSION_CHANGED','ACTION_EXECUTED')),
  source text NOT NULL,
  provider text,
  resource_id uuid REFERENCES provider_resources(id),
  revision text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance text NOT NULL
);
CREATE INDEX IF NOT EXISTS change_events_service_idx ON change_events(service_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS change_events_site_idx ON change_events(site_id, occurred_at DESC);
DROP TRIGGER IF EXISTS change_events_append_only ON change_events;
CREATE TRIGGER change_events_append_only BEFORE UPDATE OR DELETE ON change_events
  FOR EACH ROW EXECUTE FUNCTION kora_reject_mutation();

CREATE TABLE IF NOT EXISTS resource_allocations (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  resource_kind text NOT NULL CHECK (resource_kind IN ('COMPUTE','STORAGE','BANDWIDTH','DATABASE','AI_ALLOWANCE','SITE_COUNT')),
  limit_value numeric,
  limit_unit text,
  used_value numeric,
  usage_source text NOT NULL DEFAULT 'NOT_AVAILABLE_FROM_PROVIDER',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provisioning_jobs (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id),
  provider text NOT NULL,
  resource_kind text NOT NULL,
  billable boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'REQUESTED' CHECK (state IN ('REQUESTED','POLICY_CHECK','AWAITING_APPROVAL','PROVISIONING','ACTIVE','FAILED','DECOMMISSIONING','DECOMMISSIONED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  object_type text,
  object_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reasoner_outputs (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- No FK: a foreign key would make TRUNCATE on diagnostic_snapshots fail before its immutability trigger fires.
  snapshot_id uuid,
  source text NOT NULL CHECK (source IN ('MODEL','DETERMINISTIC_FALLBACK')),
  model text,
  output jsonb NOT NULL,
  rejection_reason text,
  input_hash text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reasoner_outputs_incident_idx ON reasoner_outputs(incident_id, created_at DESC);

-- Remediation. The proposal row carries the current state; the other tables are
-- the append-only trail of how it got there.
CREATE TABLE IF NOT EXISTS action_proposals (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id),
  incident_id uuid NOT NULL REFERENCES incidents(id),
  service_id uuid NOT NULL REFERENCES services(id),
  action_type text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  proposed_by text NOT NULL,
  reasoner_output_id uuid REFERENCES reasoner_outputs(id),
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('PROPOSED','POLICY_EVALUATED','AWAITING_APPROVAL','DENIED','READY','REJECTED','EXPIRED','EXECUTING','EXECUTED','EXECUTION_FAILED','VERIFYING','RECOVERY_VERIFIED','RECOVERY_FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_proposals_incident_idx ON action_proposals(incident_id, created_at);

CREATE TABLE IF NOT EXISTS policy_decisions (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('DENY','REQUIRE_APPROVAL','ALLOW')),
  policy_code text NOT NULL,
  reason text NOT NULL,
  risk text NOT NULL,
  input jsonb NOT NULL,
  expires_at timestamptz,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS action_approvals (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  decided_by uuid NOT NULL REFERENCES users(id),
  note text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id)
);
CREATE TABLE IF NOT EXISTS action_executions (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  attempt integer NOT NULL,
  executor text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('SUCCEEDED','FAILED','UNSUPPORTED','REQUIRES_MANUAL_PROVIDER_ACTION','TIMED_OUT')),
  response_class text NOT NULL,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  UNIQUE (action_id, attempt)
);
CREATE TABLE IF NOT EXISTS recovery_verifications (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  outcome text NOT NULL CHECK (outcome IN ('RECOVERY_VERIFIED','RECOVERY_FAILED')),
  window_started_at timestamptz NOT NULL,
  decided_at timestamptz NOT NULL,
  observation_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  recovery_seconds numeric,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (action_id)
);
DROP TRIGGER IF EXISTS policy_decisions_append_only ON policy_decisions;
CREATE TRIGGER policy_decisions_append_only BEFORE UPDATE OR DELETE ON policy_decisions FOR EACH ROW EXECUTE FUNCTION kora_reject_mutation();
DROP TRIGGER IF EXISTS action_executions_append_only ON action_executions;
CREATE TRIGGER action_executions_append_only BEFORE UPDATE OR DELETE ON action_executions FOR EACH ROW EXECUTE FUNCTION kora_reject_mutation();
DROP TRIGGER IF EXISTS recovery_verifications_append_only ON recovery_verifications;
CREATE TRIGGER recovery_verifications_append_only BEFORE UPDATE OR DELETE ON recovery_verifications FOR EACH ROW EXECUTE FUNCTION kora_reject_mutation();
