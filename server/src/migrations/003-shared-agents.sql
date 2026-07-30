/**
 * Migration: 创建 shared_agents 和 agent_usage_log 表
 * 演的动态Agent共享池
 */

export const up = `
CREATE TABLE IF NOT EXISTS shared_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stance TEXT NOT NULL,
  color TEXT,
  glow TEXT,
  symbol TEXT,

  identity TEXT NOT NULL,
  methodology TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  persona TEXT,

  questionTypes JSON DEFAULT '[]',
  perspectives JSON DEFAULT '[]',
  tags JSON DEFAULT '[]',

  source TEXT NOT NULL DEFAULT 'dynamic',
  fingerprint TEXT,
  quality_score REAL DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,
  creator_id TEXT,
  is_public INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shared_agents_fingerprint ON shared_agents(fingerprint);
CREATE INDEX IF NOT EXISTS idx_shared_agents_source ON shared_agents(source);
CREATE INDEX IF NOT EXISTS idx_shared_agents_usage ON shared_agents(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_shared_agents_archived ON shared_agents(archived);

CREATE TABLE IF NOT EXISTS agent_usage_log (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  query_fingerprint TEXT,
  used_for TEXT,
  used_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_log_agent ON agent_usage_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_log_time ON agent_usage_log(used_at DESC);
`;

export const down = `
DROP TABLE IF EXISTS agent_usage_log;
DROP TABLE IF EXISTS shared_agents;
`;
