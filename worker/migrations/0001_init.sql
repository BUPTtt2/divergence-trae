-- ============================================================
-- 演策 · 八卦推演引擎 D1 Schema
-- 数据库: Cloudflare D1 (SQLite)
-- 版本: 1.0.0
-- 创建时间: 2026-07-14
-- ============================================================

-- 迁移版本追踪
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  executed_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 用户与认证
-- ============================================================

-- 用户主表 — 支持匿名升级为注册账号
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- UUID，匿名时即生成
  anonymous INTEGER DEFAULT 1,        -- 1=匿名 0=已注册
  email TEXT UNIQUE,                  -- 注册后才有
  password_hash TEXT,                 -- Argon2 哈希（注册后才有）
  nickname TEXT,                      -- 显示名
  avatar TEXT,                        -- 头像字符
  color TEXT,                         -- 用户主题色
  bio TEXT,                           -- 简介
  realm TEXT DEFAULT '初境',          -- 修炼境界
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_login_date TEXT,
  total_inferences INTEGER DEFAULT 0,
  total_chats INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_anonymous ON users(anonymous);

-- 刷新令牌（撤销列表）
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);

-- ============================================================
-- 推演核心
-- ============================================================

-- 推演会话 — 完整状态机
CREATE TABLE IF NOT EXISTS inference_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  question_type TEXT,
  status TEXT DEFAULT 'active',        -- active | committed | archived
  phase TEXT DEFAULT 'input',          -- input | summoning | agent_select | agent_debate | reflecting | summary | committing | oracle | branch_select | path_reveal | final
  agent_ids TEXT,                      -- JSON array
  selected_agent_ids TEXT,             -- JSON array
  dialogue_history TEXT,               -- JSON {agentId: text}
  analysis TEXT,
  reasoning TEXT,
  summary TEXT,
  options TEXT,                        -- JSON array
  divination_result TEXT,              -- JSON
  selected_choice TEXT,
  commit_text TEXT,
  divergence_score REAL DEFAULT 0,     -- 分歧度
  reflection_duration_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON inference_sessions(user_id, status, created_at DESC);

-- 命签（命运卡）
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  gua TEXT, trigram TEXT, element TEXT,
  title TEXT, question TEXT, decision TEXT, verse TEXT, summary TEXT,
  advisors TEXT,                       -- JSON array
  rarity TEXT, style TEXT, pillars TEXT,
  powerful_question TEXT, framework TEXT,
  is_shared INTEGER DEFAULT 0,         -- 是否公开到社区
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_shared ON cards(is_shared, created_at DESC);

-- 卡片笔记
CREATE TABLE IF NOT EXISTS card_notes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notes_card ON card_notes(card_id, created_at DESC);

-- ============================================================
-- 智囊
-- ============================================================

-- 自定义智囊（私有）
CREATE TABLE IF NOT EXISTS custom_advisors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  perspective TEXT NOT NULL,
  style TEXT DEFAULT '周易古风',
  element TEXT,
  trigram TEXT,
  color TEXT,
  origin_market_id TEXT,               -- 若来自市集订阅，存市集ID
  feedback_count INTEGER DEFAULT 0,    -- 反馈累计次数
  feedback_summary TEXT,               -- JSON 反馈统计
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_advisors_user ON custom_advisors(user_id);

-- 智囊市集（公共）
CREATE TABLE IF NOT EXISTS agent_market (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_name TEXT,
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  perspective TEXT NOT NULL,
  style TEXT,
  element TEXT, trigram TEXT, color TEXT,
  subscriber_count INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  tags TEXT,                            -- JSON array
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_market_subscribers ON agent_market(subscriber_count DESC);
CREATE INDEX IF NOT EXISTS idx_market_author ON agent_market(author_id);

-- 市集订阅关系
CREATE TABLE IF NOT EXISTS market_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_agent_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, market_agent_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON market_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_market ON market_subscriptions(market_agent_id);

-- 智囊反馈（用于调校迭代）
CREATE TABLE IF NOT EXISTS agent_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  feedback_type TEXT NOT NULL,         -- too_long | too_short | off_topic | too_abstract | good | other
  feedback_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_agent ON agent_feedback(agent_id, created_at DESC);

-- ============================================================
-- 每日玩法
-- ============================================================

-- 每日卦签
CREATE TABLE IF NOT EXISTS daily_divinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  gua TEXT, verse TEXT, message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_user ON daily_divinations(user_id, date);

-- 日历事件
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  type TEXT NOT NULL,                  -- inference | daily | followup | note
  ref_id TEXT,                         -- 关联记录ID
  title TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_calendar_user_date ON calendar_events(user_id, date);

-- ============================================================
-- 演的对话
-- ============================================================

-- 对话会话
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  last_message_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, last_message_at DESC);

-- 对话消息
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                  -- user | assistant | system
  content TEXT NOT NULL,
  meta TEXT,                           -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON conversation_messages(conversation_id, created_at);

-- 演的长期记忆
CREATE TABLE IF NOT EXISTS user_memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,              -- deduction | preference | fact | profile
  title TEXT,
  content TEXT NOT NULL,
  source TEXT,
  confidence REAL DEFAULT 0.8,
  importance INTEGER DEFAULT 3,
  meta TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id, category, created_at DESC);

-- ============================================================
-- 社区
-- ============================================================

-- 社区帖子
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_avatar TEXT,
  user_color TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tag TEXT,
  trigram TEXT,
  gua TEXT,
  card_id TEXT,
  likes INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_tag ON community_posts(tag, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON community_posts(user_id);

-- 帖子回复
CREATE TABLE IF NOT EXISTS community_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_avatar TEXT,
  user_color TEXT,
  content TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replies_post ON community_replies(post_id, created_at);

-- 点赞（用户+帖子唯一）
CREATE TABLE IF NOT EXISTS community_likes (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON community_likes(post_id);

-- ============================================================
-- 决策回访
-- ============================================================

CREATE TABLE IF NOT EXISTS decision_follow_ups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT,
  question TEXT,
  decision TEXT,
  follow_up_date TEXT NOT NULL,        -- YYYY-MM-DD
  status TEXT DEFAULT 'pending',       -- pending | done | skipped
  result_note TEXT,
  actual_outcome TEXT,                 -- 实际结局对照
  rating INTEGER,                      -- 决策评分 1-5
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_followup_user_status ON decision_follow_ups(user_id, status);
CREATE INDEX IF NOT EXISTS idx_followup_date ON decision_follow_ups(follow_up_date);

-- ============================================================
-- 成就
-- ============================================================

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,        -- 成就模板ID
  unlocked_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_ach_user ON achievements(user_id);

-- ============================================================
-- 审计日志（生产级要求）
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip TEXT,
  user_agent TEXT,
  meta TEXT,                           -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC);

-- ============================================================
-- 记录迁移版本
-- ============================================================

INSERT OR IGNORE INTO migrations (version, name) VALUES ('1.0.0', 'initial_schema');
