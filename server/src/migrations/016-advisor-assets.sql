ALTER TABLE custom_advisors
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS published_advisors (
  id TEXT PRIMARY KEY,
  source_advisor_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  perspective TEXT NOT NULL,
  style TEXT,
  element TEXT,
  trigram TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',
  subscription_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_user_id, source_advisor_id, version),
  UNIQUE (owner_user_id, source_advisor_id, snapshot_hash)
);

CREATE TABLE IF NOT EXISTS advisor_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  published_advisor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, published_advisor_id)
);

CREATE INDEX IF NOT EXISTS idx_published_advisors_market
  ON published_advisors(status, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_advisors_owner
  ON published_advisors(owner_user_id, source_advisor_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_advisor_subscriptions_user
  ON advisor_subscriptions(user_id, created_at DESC);
