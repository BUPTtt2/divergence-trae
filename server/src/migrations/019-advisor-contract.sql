ALTER TABLE custom_advisors
  ADD COLUMN IF NOT EXISTS contract_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS methodology JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deliverable TEXT,
  ADD COLUMN IF NOT EXISTS tool_policy JSONB NOT NULL DEFAULT '{"allow":[],"deny":["business_write"]}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_policy JSONB NOT NULL DEFAULT '{"minimumLevel":"E0"}'::jsonb,
  ADD COLUMN IF NOT EXISTS completion_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS budget JSONB NOT NULL DEFAULT '{"maxTurns":2,"maxToolCalls":0,"timeoutMs":35000}'::jsonb,
  ADD COLUMN IF NOT EXISTS eval_summary JSONB;

ALTER TABLE published_advisors
  ADD COLUMN IF NOT EXISTS contract_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS eval_status TEXT NOT NULL DEFAULT 'unverified';
