-- Shared request accounting for external media providers (Unsplash allows a fixed number of API requests per hour to the
-- whole application, so the count must be shared by every instance). New table only; nothing existing is touched.
-- Rollback: DROP TABLE media_provider_quota; (the counter is disposable and rebuilds itself).
CREATE TABLE IF NOT EXISTS media_provider_quota (
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9-]{2,40}$'),
  window_start timestamptz NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, window_start)
);
