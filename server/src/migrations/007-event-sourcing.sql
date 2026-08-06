-- v3.0 Event Sourcing：事件快照表
-- 迁移版本: 7
-- 创建时间: 2026-08-01
-- 依据: docs/specs/2026-08-01-industrial-v3-design.md 第5节
--
-- 设计要点:
-- - 状态从 deliberation_events 重放得出，定期快照加速恢复
-- - 事件追加是原子INSERT，不需要额外事务（Event Sourcing 本身解决一致性）
-- - 快照 = 某个version的完整状态投影，恢复时读快照+重放后续事件

-- 事件快照表
CREATE TABLE IF NOT EXISTS deliberation_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snap_session ON deliberation_snapshots(session_id, version DESC);

-- deliberation_sessions 增加 version 列（兼容旧表，记录已应用的事件数）
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0;
