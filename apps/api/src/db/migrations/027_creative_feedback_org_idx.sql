-- Design history is read per organisation (the account's recent design decisions), not per site. Without this the
-- read scans every site's feedback. Index only; no data or constraint changes, safe to re-run.
CREATE INDEX IF NOT EXISTS creative_feedback_org_idx ON creative_feedback(org_id, kind, created_at DESC);
