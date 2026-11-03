-- Owner-supplied logo and photos. Bytes are re-encoded by the server (never the uploaded file), metadata is stripped,
-- and responsive variants are stored with the row. Rows are never deleted by the owner: "remove" hides a picture from
-- the library and from future designs, while earlier site versions and artifacts that already reference it keep working
-- (historical outputs are never mutated).
CREATE TABLE IF NOT EXISTS owner_media (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('logo','photo')),
  role text NOT NULL DEFAULT 'general' CHECK (role IN ('product','service','portfolio','team','location','environment','process','gallery','general','logo')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 20000),
  has_alpha boolean NOT NULL DEFAULT false,
  alt text NOT NULL DEFAULT '' CHECK (char_length(alt) <= 200),
  focal_x real NOT NULL DEFAULT 0.5 CHECK (focal_x BETWEEN 0 AND 1),
  focal_y real NOT NULL DEFAULT 0.5 CHECK (focal_y BETWEEN 0 AND 1),
  quality jsonb NOT NULL,
  provenance jsonb NOT NULL,
  -- the public, display-ready bytes: webp variants for photos, a png for logos
  v640 bytea,
  v1280 bytea,
  v1920 bytea,
  logo_png bytea,
  thumb bytea NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  replaced_by uuid,
  UNIQUE (id, site_id),
  CONSTRAINT owner_media_site_org_fk FOREIGN KEY (site_id, org_id) REFERENCES sites(id, org_id) ON DELETE CASCADE,
  CONSTRAINT owner_media_kind_bytes CHECK ((kind = 'logo' AND logo_png IS NOT NULL) OR (kind = 'photo' AND v1280 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS owner_media_site_idx ON owner_media(site_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS owner_media_dedupe_idx ON owner_media(site_id, sha256) WHERE removed_at IS NULL;
