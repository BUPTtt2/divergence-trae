-- 添加用户表和token表
-- 迁移版本: 2

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

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);