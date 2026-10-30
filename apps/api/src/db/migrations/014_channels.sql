-- Channel connections: one row per site per provider. Provider tokens are stored encrypted and are never
-- returned by any API; the browser only ever sees state, account name and capabilities.
CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL CHECK (provider IN ('instagram','facebook','whatsapp','google_business','search_console','tiktok','linkedin')),
  state text NOT NULL CHECK (state IN ('CONNECTED','AUTH_EXPIRED','PERMISSION_REQUIRED','RATE_LIMITED','DEGRADED','DISCONNECTED','NOT_SUPPORTED')),
  mode text NOT NULL DEFAULT 'LIVE' CHECK (mode IN ('LIVE','SANDBOX')),
  external_account_id text,
  account_name text,
  scopes text[] NOT NULL DEFAULT '{}',
  token_ciphertext text,
  token_expires_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  connected_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, provider),
  CONSTRAINT channel_connections_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
-- An external account (for example a WhatsApp phone number id) can belong to one site only.
CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_external_unique
  ON channel_connections(provider, external_account_id) WHERE external_account_id IS NOT NULL AND state <> 'DISCONNECTED';

-- OAuth state: single use, short lived, bound to the user and site that started the flow (CSRF protection).
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash text PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_states_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);

-- Every inbound provider webhook is persisted before it is processed; (provider, event id) makes replay a no-op.
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  external_event_id text NOT NULL,
  org_id uuid REFERENCES organizations(id),
  site_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  detail text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, external_event_id)
);
