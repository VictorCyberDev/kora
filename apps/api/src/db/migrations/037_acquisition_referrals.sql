-- M15: first-party, consented referral attribution. The public audit source is
-- immutable; the user/organization can withdraw participation at any time.
-- Never store raw share tokens, emails, IP addresses or user agents here.
CREATE TABLE IF NOT EXISTS acquisition_referrals (
  id uuid PRIMARY KEY,
  source_audit_id uuid NOT NULL REFERENCES public_audits(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (source_audit_id, org_id, user_id)
);
CREATE INDEX IF NOT EXISTS acquisition_referrals_org_idx
  ON acquisition_referrals(org_id, created_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS acquisition_referrals_source_idx
  ON acquisition_referrals(source_audit_id, created_at DESC)
  WHERE revoked_at IS NULL;
