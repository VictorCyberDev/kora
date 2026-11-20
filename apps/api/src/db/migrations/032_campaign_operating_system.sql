-- Campaign workspace metadata and links to existing source-of-truth documents.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS direction jsonb;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand_os_version integer;

-- Composite references below make it impossible to attach another tenant's
-- editable source even if a caller learns its UUID.
ALTER TABLE creative_documents
  ADD CONSTRAINT creative_documents_id_site_unique UNIQUE (id,site_id);

CREATE TABLE IF NOT EXISTS campaign_assets (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'website','flyer','poster','social','carousel','video','caption','manual_package'
  )),
  creative_document_id uuid,
  motion_project_id uuid,
  media_asset_id uuid,
  href text,
  source jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','APPROVAL_NEEDED','APPROVED','READY','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_assets_campaign_fk
    FOREIGN KEY (campaign_id,site_id) REFERENCES campaigns(id,site_id) ON DELETE CASCADE,
  CONSTRAINT campaign_assets_site_org_fk
    FOREIGN KEY (site_id,org_id) REFERENCES sites(id,org_id) ON DELETE CASCADE,
  CONSTRAINT campaign_assets_media_fk
    FOREIGN KEY (media_asset_id,site_id) REFERENCES media_assets(id,site_id),
  CONSTRAINT campaign_assets_document_fk
    FOREIGN KEY (creative_document_id,site_id)
    REFERENCES creative_documents(id,site_id),
  CONSTRAINT campaign_assets_motion_fk
    FOREIGN KEY (motion_project_id,site_id)
    REFERENCES motion_projects(id,site_id),
  CONSTRAINT campaign_assets_locator
    CHECK (
      creative_document_id IS NOT NULL OR motion_project_id IS NOT NULL
      OR media_asset_id IS NOT NULL OR href IS NOT NULL OR source <> '{}'
    )
);
CREATE INDEX IF NOT EXISTS campaign_assets_campaign_idx
  ON campaign_assets(campaign_id,created_at);
