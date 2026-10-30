-- Domains, billing and usage.
CREATE TABLE IF NOT EXISTS domains (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  hostname text NOT NULL CHECK (hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'),
  flow text NOT NULL CHECK (flow IN ('CONNECT_EXISTING','PURCHASE')),
  provider text NOT NULL,
  state text NOT NULL CHECK (state IN ('REQUESTED','AWAITING_PAYMENT','REGISTERING','DNS_REQUIRED','VERIFYING','ACTIVE','FAILED')),
  registrar_state text NOT NULL DEFAULT 'NOT_APPLICABLE',
  dns_state text NOT NULL DEFAULT 'UNKNOWN' CHECK (dns_state IN ('UNKNOWN','MISCONFIGURED','POINTING_ELSEWHERE','CORRECT')),
  ssl_state text NOT NULL DEFAULT 'UNKNOWN' CHECK (ssl_state IN ('UNKNOWN','PENDING','ACTIVE','FAILED')),
  target text NOT NULL,
  last_verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hostname)
);
CREATE TABLE IF NOT EXISTS domain_status_events (
  id uuid PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  interval text NOT NULL CHECK (interval IN ('monthly','annually','none')),
  paystack_plan_code text,
  capabilities jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  state text NOT NULL CHECK (state IN ('TRIAL','ACTIVE','PAST_DUE','CANCELED','EXPIRED')),
  provider text NOT NULL,
  provider_subscription_code text,
  provider_customer_code text,
  current_period_end timestamptz,
  grace_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_org_current ON subscriptions(org_id) WHERE state IN ('TRIAL','ACTIVE','PAST_DUE');
CREATE TABLE IF NOT EXISTS billing_transactions (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  plan_id uuid REFERENCES plans(id),
  provider text NOT NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING','VERIFIED','FAILED','ABANDONED')),
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  processed_at timestamptz,
  outcome text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  dimension text NOT NULL CHECK (dimension IN ('AI_INPUT_TOKENS','AI_OUTPUT_TOKENS','GENERATION','PUBLISH','STORAGE_BYTES','DOMAIN_OPERATION','FORM_SUBMISSION','MONITORED_SITE','ACTION_EXECUTION')),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS usage_org_time_idx ON usage_events(org_id, occurred_at DESC);
DROP TRIGGER IF EXISTS usage_events_append_only ON usage_events;
CREATE TRIGGER usage_events_append_only BEFORE UPDATE ON usage_events FOR EACH ROW EXECUTE FUNCTION kora_reject_mutation();
