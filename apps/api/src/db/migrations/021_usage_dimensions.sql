-- Marketing features meter what they do in the same append-only usage table. Metering only: no limits or credits.
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_dimension_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_dimension_check CHECK (dimension IN (
  'AI_INPUT_TOKENS','AI_OUTPUT_TOKENS','GENERATION','PUBLISH','STORAGE_BYTES','DOMAIN_OPERATION','FORM_SUBMISSION','MONITORED_SITE','ACTION_EXECUTION',
  'CONTENT_DRAFT','IMAGE_RENDER','VIDEO_RENDER','POST_PUBLISHED','CAMPAIGN_BUNDLE'));
