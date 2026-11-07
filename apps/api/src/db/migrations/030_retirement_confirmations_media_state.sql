-- Completion of safe deletion, server-held owner confirmations, and shared (multi-instance) media state.
-- Additive: one CHECK widened (a new allowed value), new tables, one nullable column. No data is rewritten.
-- Rollback notes are in docs/evidence/creative-vnext/ROLLBACK-PLAN.md.

-- 1. A deleted site's custom domains are released, not left ACTIVE. The Site Host serves only ACTIVE/VERIFYING.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'domains'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%AWAITING_PAYMENT%'
  LOOP EXECUTE format('ALTER TABLE domains DROP CONSTRAINT %I', c); END LOOP;
  ALTER TABLE domains ADD CONSTRAINT domains_state_check
    CHECK (state IN ('REQUESTED','AWAITING_PAYMENT','REGISTERING','DNS_REQUIRED','VERIFYING','ACTIVE','FAILED','RELEASED'));
END $$;

-- 2. Statements an owner has explicitly confirmed are true of their business. Append-only: a confirmation is a record of a
-- human action (who, when, exactly what text) and is never edited or removed.
CREATE TABLE IF NOT EXISTS owner_confirmations (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[a-f0-9]{64}$'),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 900),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, text_sha256)
);
CREATE OR REPLACE FUNCTION kora_owner_confirmation_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'owner confirmations are append-only' USING ERRCODE = 'restrict_violation'; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS owner_confirmations_immutable ON owner_confirmations;
CREATE TRIGGER owner_confirmations_immutable BEFORE UPDATE OR DELETE ON owner_confirmations
  FOR EACH ROW EXECUTE FUNCTION kora_owner_confirmation_immutable();

-- 3. Media provider state that must be identical whichever API instance serves the request.
CREATE TABLE IF NOT EXISTS media_rate_counters (
  key text NOT NULL CHECK (length(key) <= 200),
  window_start timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (key, window_start)
);
CREATE TABLE IF NOT EXISTS media_candidate_cache (
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9-]{2,40}$'),
  query_key text NOT NULL CHECK (length(query_key) <= 300),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, query_key)
);
CREATE TABLE IF NOT EXISTS media_selections (
  org_id uuid NOT NULL REFERENCES organizations(id),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9-]{2,40}$'),
  image_id text NOT NULL CHECK (length(image_id) <= 80),
  selected_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, provider, image_id)
);

-- 4. Enquiries of a deleted site are kept until the owner explicitly erases them; erasure records when it happened.
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS erased_at timestamptz;
