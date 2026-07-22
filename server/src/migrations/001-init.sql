-- 初始化所有表结构
-- 迁移版本: 1.0.0
-- 创建时间: 2026-07-13

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  anonymous BOOLEAN DEFAULT FALSE,
  email TEXT UNIQUE,
  password_hash TEXT,
  nickname TEXT,
  avatar TEXT,
  color TEXT,
  bio TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  realm TEXT DEFAULT '初境',
  streak_days INTEGER DEFAULT 0,
  last_login_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gua TEXT, trigram TEXT, element TEXT,
  title TEXT, question TEXT, decision TEXT, verse TEXT, summary TEXT,
  advisors TEXT, rarity TEXT, style TEXT, pillars TEXT,
  powerful_question TEXT, framework TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tag TEXT, trigram TEXT,
  user_id TEXT, user_name TEXT,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id TEXT, user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT,
  importance INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS custom_advisors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  perspective TEXT NOT NULL,
  style TEXT DEFAULT '周易古风',
  element TEXT,
  trigram TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_divinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  gua TEXT,
  verse TEXT,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_levels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  realm TEXT DEFAULT '初境',
  total_inferences INTEGER DEFAULT 0,
  total_chats INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_login_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_follow_ups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT,
  question TEXT,
  decision TEXT,
  follow_up_date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  result_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inference_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  phase TEXT DEFAULT 'input',
  agent_ids TEXT,
  current_agent_idx INTEGER DEFAULT -1,
  dialogue_history TEXT,
  analysis TEXT,
  reasoning TEXT,
  summary TEXT,
  options TEXT,
  divination_result TEXT,
  selected_choice TEXT,
  commit_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
