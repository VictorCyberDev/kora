-- Controlled tests only: marks one published version as faulty so that Kora's
-- hosted serving returns a real HTTP failure for it. Gated by KORA_CHAOS_ENABLED.
CREATE TABLE IF NOT EXISTS site_faults (
  site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES site_versions(id),
  mode text NOT NULL CHECK (mode IN ('http_500','timeout')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
