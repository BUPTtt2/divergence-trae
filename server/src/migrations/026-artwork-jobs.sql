CREATE TABLE IF NOT EXISTS artwork_jobs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  style_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  credit_consumed BOOLEAN NOT NULL DEFAULT FALSE,
  error_code TEXT,
  version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, card_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS artwork_versions (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES artwork_jobs(id) ON DELETE CASCADE,
  style_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  model TEXT,
  size TEXT,
  persistent BOOLEAN NOT NULL DEFAULT FALSE,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_owner_card
ON artwork_jobs(user_id, card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artwork_versions_owner_card
ON artwork_versions(user_id, card_id, created_at DESC);
