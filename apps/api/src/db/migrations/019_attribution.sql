-- Attribution: tracked links Kora creates and the events that arrive through them. Only visits that came through a
-- tracked link are recorded; ordinary visits are never measured.
CREATE TABLE IF NOT EXISTS attribution_links (
  code text PRIMARY KEY CHECK (code ~ '^[a-z]{8}$'),
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL,
  campaign_id uuid,
  item_id uuid,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attribution_links_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS attribution_links_campaign_unique ON attribution_links(campaign_id, provider) WHERE campaign_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attribution_links_item_unique ON attribution_links(item_id, provider) WHERE item_id IS NOT NULL AND campaign_id IS NULL;
CREATE INDEX IF NOT EXISTS attribution_links_site_idx ON attribution_links(site_id);

CREATE TABLE IF NOT EXISTS attribution_events (
  id uuid PRIMARY KEY,
  code text NOT NULL REFERENCES attribution_links(code) ON DELETE CASCADE,
  site_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('VISIT','WHATSAPP_TAP','CALL_TAP')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attribution_events_idx ON attribution_events(site_id, occurred_at);
CREATE INDEX IF NOT EXISTS attribution_events_code_idx ON attribution_events(code, kind);
