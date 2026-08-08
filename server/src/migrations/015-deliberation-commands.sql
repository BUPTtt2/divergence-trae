CREATE TABLE IF NOT EXISTS deliberation_commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('SUPPLEMENT', 'CORRECTION', 'QUESTION', 'PAUSE')),
  content TEXT NOT NULL DEFAULT '',
  target_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONSUMED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliberation_commands_pending
  ON deliberation_commands(session_id, status, created_at);
