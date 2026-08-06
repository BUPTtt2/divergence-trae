-- P1 Eval Pipeline: 推演质量评估表
-- 迁移版本: 6
-- 创建时间: 2026-08-01
-- 说明:
-- - 每次 commit 后异步评估 4 项指标（1-5 分）
-- - 评估失败不阻塞主流程（commit 不 await evaluateSession）
-- - 指标: relevance(相关性) / diversity(多元性) / no_hallucination(无幻觉) / actionability(可操作性)

CREATE TABLE IF NOT EXISTS session_eval (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  relevance INTEGER,
  diversity INTEGER,
  no_hallucination INTEGER,
  actionability INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_eval_session ON session_eval(session_id);
CREATE INDEX IF NOT EXISTS idx_session_eval_user ON session_eval(user_id);
