CREATE TABLE IF NOT EXISTS llm_usage_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  stage TEXT NOT NULL,
  agent_id TEXT,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  usage_missing BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cny NUMERIC(14, 8),
  error_status INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_session_time
  ON llm_usage_events(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user_time
  ON llm_usage_events(user_id, created_at DESC);

