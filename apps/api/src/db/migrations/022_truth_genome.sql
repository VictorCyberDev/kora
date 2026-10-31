-- Truth Engine claim ledgers and Brand Genome versions. Both are append-only: a ledger records what an artefact
-- was allowed to say at that moment, a genome version records what the brand was at that moment.
CREATE TABLE IF NOT EXISTS claim_ledgers (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  claims jsonb NOT NULL,
  result jsonb NOT NULL,
  publishable boolean NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_ledgers_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS claim_ledgers_site_idx ON claim_ledgers(site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brand_genomes (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK (version >= 1),
  genome jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, version),
  CONSTRAINT brand_genomes_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS brand_genomes_site_idx ON brand_genomes(site_id, version DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'claim_ledgers_immutable') THEN
    CREATE TRIGGER claim_ledgers_immutable BEFORE UPDATE ON claim_ledgers FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'brand_genomes_immutable') THEN
    CREATE TRIGGER brand_genomes_immutable BEFORE UPDATE ON brand_genomes FOR EACH ROW EXECUTE FUNCTION kora_immutable_rows();
  END IF;
END $$;
