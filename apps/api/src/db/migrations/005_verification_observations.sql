-- Deployment Verification (not cryptographic): what was observed about a
-- workload's claim and about its source, one row per observation, grouped by
-- check_id. Append-only by convention (rows are never updated); unknown stays
-- NULL; no secret is ever stored (no token, no response body, no headers).
CREATE TABLE IF NOT EXISTS verification_observations (
  id uuid PRIMARY KEY,
  check_id uuid NOT NULL,
  service_id uuid NOT NULL REFERENCES services(id),
  kind text NOT NULL CHECK (kind IN ('scm_head','workload_claim','commit_relation')),
  outcome text NOT NULL CHECK (outcome IN ('OBSERVED','UNKNOWN')),
  observed_at timestamptz NOT NULL,
  source_url text NOT NULL,
  http_status integer CHECK (http_status BETWEEN 100 AND 599),
  reason text,
  -- scm_head: the branch head. workload_claim: the claimed commit (NULL when
  -- the claim carries none). commit_relation: unused.
  commit_sha text CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
  -- workload_claim fields, exactly as reported.
  commit_source text CHECK (commit_source IN ('build-info','env','unavailable')),
  built_at timestamptz,
  claim_service text,
  claim_environment text,
  claim_started_at timestamptz,
  -- commit_relation fields: how the claimed commit relates to the head.
  relation text CHECK (relation IN ('identical','claimed_behind','claimed_ahead','diverged')),
  behind_by integer CHECK (behind_by >= 0),
  ahead_by integer CHECK (ahead_by >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_id, kind),
  CHECK (outcome = 'UNKNOWN' OR reason IS NULL),
  CHECK (outcome = 'OBSERVED' OR (
    reason IS NOT NULL AND commit_sha IS NULL AND commit_source IS NULL
    AND built_at IS NULL AND claim_service IS NULL AND claim_environment IS NULL
    AND claim_started_at IS NULL AND relation IS NULL
    AND behind_by IS NULL AND ahead_by IS NULL)),
  CHECK (kind = 'workload_claim' OR (
    commit_source IS NULL AND built_at IS NULL AND claim_service IS NULL
    AND claim_environment IS NULL AND claim_started_at IS NULL)),
  CHECK (kind = 'commit_relation' OR (
    relation IS NULL AND behind_by IS NULL AND ahead_by IS NULL)),
  CHECK (kind <> 'scm_head' OR outcome = 'UNKNOWN' OR commit_sha IS NOT NULL),
  CHECK (kind <> 'commit_relation' OR outcome = 'UNKNOWN' OR relation IS NOT NULL),
  CHECK (kind <> 'workload_claim' OR outcome = 'UNKNOWN' OR (
    commit_source IS NOT NULL AND claim_service IS NOT NULL
    AND claim_environment IS NOT NULL AND claim_started_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS verification_observations_service_time_idx
  ON verification_observations(service_id, observed_at DESC);
