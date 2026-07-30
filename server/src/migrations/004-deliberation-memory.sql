-- 真 Agent 架构 Step 1: 推演记忆系统
-- 迁移版本: 4
-- 创建时间: 2026-07-30
-- 依据: docs/REAL_AGENT_ARCHITECTURE.md 8.1 节
--
-- 说明:
-- - created_at/updated_at 用 TIMESTAMPTZ DEFAULT NOW()，兼容 db.js update 自动注入 `updated_at = NOW()`
-- - last_accessed_at/expires_at 用 BIGINT（epoch 毫秒），由 memoryService 手动维护
-- - embedding 用 TEXT（存 JSON 数组字符串），PG/内存双模式兼容，无需向量库依赖
-- - plan/tool_results/findings/oracle/memory_used 用 JSONB，pg 驱动自动序列化对象

-- L1 工作记忆载体：推演会话
CREATE TABLE IF NOT EXISTS deliberation_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  question TEXT,
  plan JSONB,
  state TEXT,
  tool_results JSONB,
  findings JSONB,
  oracle JSONB,
  memory_used JSONB,
  replan_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- L2 会话记忆：近 7 天推演摘要
CREATE TABLE IF NOT EXISTS session_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  summary TEXT,
  question TEXT,
  choice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at BIGINT
);

-- L3 长期命格：用户偏好/性格/历史决策/曾虑之事
CREATE TABLE IF NOT EXISTS user_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  memory_type TEXT,
  content TEXT,
  embedding TEXT,
  importance INTEGER DEFAULT 3,
  last_accessed_at BIGINT,
  access_count INTEGER DEFAULT 1,
  source_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
