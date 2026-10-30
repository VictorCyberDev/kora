-- Customer Hub: customers, leads (one conversation per enquiry), messages and follow-ups.
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  phone text,
  phone_key text,
  email text,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT customers_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON customers(site_id, phone_key) WHERE phone_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers(site_id, lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  customer_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('WEBSITE_FORM','WHATSAPP','INSTAGRAM','FACEBOOK','MANUAL')),
  source_ref text,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','NEEDS_REPLY','FOLLOW_UP','WON','LOST','CLOSED')),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 500),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, site_id),
  CONSTRAINT leads_customer_fk FOREIGN KEY (customer_id, site_id) REFERENCES customers(id, site_id) ON DELETE CASCADE,
  CONSTRAINT leads_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
-- The same enquiry arriving twice (retry, replayed webhook, re-sync) must not create a second lead.
CREATE UNIQUE INDEX IF NOT EXISTS leads_source_ref_unique ON leads(site_id, source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_site_status_idx ON leads(site_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS lead_messages (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  direction text NOT NULL CHECK (direction IN ('IN','OUT','NOTE')),
  channel text NOT NULL CHECK (channel IN ('website','whatsapp','instagram','facebook','manual')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  external_id text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_messages_lead_fk FOREIGN KEY (lead_id, site_id) REFERENCES leads(id, site_id) ON DELETE CASCADE,
  CONSTRAINT lead_messages_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_messages_external_unique ON lead_messages(site_id, channel, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_messages_lead_idx ON lead_messages(lead_id, created_at);

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY,
  lead_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  due_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  done_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_ups_lead_fk FOREIGN KEY (lead_id, site_id) REFERENCES leads(id, site_id) ON DELETE CASCADE,
  CONSTRAINT follow_ups_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS follow_ups_due_idx ON follow_ups(site_id, due_at) WHERE done_at IS NULL;
