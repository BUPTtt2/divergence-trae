CREATE TABLE IF NOT EXISTS llm_capacity_reservations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'settled', 'released', 'expired')),
  reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
  actual_tokens INTEGER NOT NULL DEFAULT 0 CHECK (actual_tokens >= 0),
  released_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_capacity_active
  ON llm_capacity_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_llm_capacity_user_day
  ON llm_capacity_reservations(user_id, created_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_llm_capacity_global_day
  ON llm_capacity_reservations(created_at DESC, status);
