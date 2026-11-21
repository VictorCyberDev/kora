-- Pin every new agency review to the exact immutable source presented for
-- approval. Existing pre-release rows are backfilled where their revision is
-- still available; the insert trigger prevents any new unpinned review.
ALTER TABLE asset_reviews ADD COLUMN IF NOT EXISTS review_source jsonb;
ALTER TABLE asset_reviews ADD COLUMN IF NOT EXISTS review_source_hash text;

UPDATE asset_reviews r
SET review_source = cr.source
FROM creative_document_revisions cr
WHERE r.object_type='creative_document'
  AND cr.document_id=r.object_id AND cr.revision=r.version
  AND r.review_source IS NULL;

UPDATE asset_reviews r
SET review_source = mr.source
FROM motion_project_revisions mr
WHERE r.object_type='motion_project'
  AND mr.project_id=r.object_id AND mr.revision=r.version
  AND r.review_source IS NULL;

UPDATE asset_reviews r
SET review_source = jsonb_build_object(
  'spec',sv.spec,'artifact',sv.artifact,'specHash',sv.spec_hash,
  'artifactHash',sv.artifact_hash,'state',sv.state
)
FROM site_versions sv
WHERE r.object_type='site_version'
  AND sv.id=r.object_id AND sv.number=r.version
  AND r.review_source IS NULL;

UPDATE asset_reviews r
SET review_source = to_jsonb(c)
FROM campaigns c
WHERE r.object_type='campaign' AND c.id=r.object_id AND r.version=1
  AND r.review_source IS NULL;

UPDATE asset_reviews
SET review_source_hash = encode(sha256(convert_to(review_source::text,'UTF8')),'hex')
WHERE review_source IS NOT NULL AND review_source_hash IS NULL;

ALTER TABLE asset_reviews DROP CONSTRAINT IF EXISTS asset_reviews_source_pair;
ALTER TABLE asset_reviews ADD CONSTRAINT asset_reviews_source_pair CHECK (
  (review_source IS NULL AND review_source_hash IS NULL)
  OR (review_source IS NOT NULL AND review_source_hash ~ '^[a-f0-9]{64}$')
);

CREATE OR REPLACE FUNCTION kora_review_source_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.review_source IS NULL OR NEW.review_source_hash IS NULL) THEN
    RAISE EXCEPTION 'reviews require an immutable source revision'
      USING ERRCODE = 'not_null_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.site_id IS DISTINCT FROM OLD.site_id
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.object_type IS DISTINCT FROM OLD.object_type
    OR NEW.object_id IS DISTINCT FROM OLD.object_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.review_source IS DISTINCT FROM OLD.review_source
    OR NEW.review_source_hash IS DISTINCT FROM OLD.review_source_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'review source and identity are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_reviews_source_immutable ON asset_reviews;
CREATE TRIGGER asset_reviews_source_immutable
BEFORE INSERT OR UPDATE ON asset_reviews
FOR EACH ROW EXECUTE FUNCTION kora_review_source_immutable();
