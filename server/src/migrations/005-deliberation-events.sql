-- v2.0 EventBus 持久化：事件流表
-- 迁移版本: 5
-- 创建时间: 2026-07-31
-- 依据: docs/重设.md 第 4 节（EventBus 替代 Blackboard，支持 Session 重放）
--
-- 说明:
-- - 所有 EventBus.emit 的事件持久化到此表
-- - Session 可从事件流重放恢复（断点续推）
-- - 调试用：可按 session_id 查询完整推演轨迹

CREATE TABLE IF NOT EXISTS deliberation_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON deliberation_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON deliberation_events(type) WHERE type IN ('STATE_CHANGE', 'ERROR');
