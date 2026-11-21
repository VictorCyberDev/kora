-- Strict commercial limits require a durable reservation before expensive
-- work begins. A reservation is idempotent by organization, dimension and
-- caller key; consumption creates at most one append-only usage event.
CREATE TABLE IF NOT EXISTS usage_reservations (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  dimension text NOT NULL CHECK (dimension IN ('VIDEO_RENDER','EXPORT')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  quantity numeric NOT NULL CHECK (quantity > 0),
  state text NOT NULL DEFAULT 'RESERVED'
    CHECK (state IN ('RESERVED','CONSUMED','RELEASED')),
  metadata jsonb NOT NULL DEFAULT '{}',
  period_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  released_at timestamptz,
  UNIQUE (org_id,dimension,idempotency_key)
);
CREATE INDEX IF NOT EXISTS usage_reservations_active_idx
  ON usage_reservations(org_id,dimension,period_start,state);

ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS usage_reservation_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='usage_events_reservation_fk'
      AND conrelid='usage_events'::regclass
  ) THEN
    ALTER TABLE usage_events ADD CONSTRAINT usage_events_reservation_fk
      FOREIGN KEY (usage_reservation_id) REFERENCES usage_reservations(id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_reservation_unique
  ON usage_events(usage_reservation_id) WHERE usage_reservation_id IS NOT NULL;

ALTER TABLE motion_renders ADD COLUMN IF NOT EXISTS usage_reservation_id uuid;
ALTER TABLE motion_renders ADD COLUMN IF NOT EXISTS idempotency_key text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='motion_renders_usage_reservation_fk'
      AND conrelid='motion_renders'::regclass
  ) THEN
    ALTER TABLE motion_renders ADD CONSTRAINT motion_renders_usage_reservation_fk
      FOREIGN KEY (usage_reservation_id) REFERENCES usage_reservations(id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS motion_renders_idempotency_unique
  ON motion_renders(org_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
