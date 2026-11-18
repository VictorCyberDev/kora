-- Expand independently persisted creative formats without rewriting existing documents.
ALTER TABLE creative_documents DROP CONSTRAINT IF EXISTS creative_documents_kind_check;
ALTER TABLE creative_documents ADD CONSTRAINT creative_documents_kind_check
  CHECK(kind IN ('flyer','poster','social','story','carousel','banner','logo',
    'ad','thumbnail','announcement','event','product'));
