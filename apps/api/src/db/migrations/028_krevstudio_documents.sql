-- Krevstudio graphic and logo studio documents. Retains existing Kora site, identity and asset tables.
CREATE TABLE IF NOT EXISTS creative_documents (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('flyer','poster','social','story','carousel','banner','logo')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ARCHIVED')),
  source jsonb NOT NULL,
  brand_version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creative_documents_site_org_fk FOREIGN KEY (site_id,org_id) REFERENCES sites(id,org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS creative_docs_site_idx ON creative_documents(site_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS creative_document_revisions (
  document_id uuid NOT NULL REFERENCES creative_documents(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision>0),
  source jsonb NOT NULL,
  brand_version integer NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id,revision)
);
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'creative_document_revisions_immutable') THEN
    CREATE TRIGGER creative_document_revisions_immutable
      BEFORE UPDATE ON creative_document_revisions
      FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $;
