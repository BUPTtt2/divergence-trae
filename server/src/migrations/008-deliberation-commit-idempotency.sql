ALTER TABLE deliberation_sessions
  ADD COLUMN IF NOT EXISTS commit_result JSONB,
  ADD COLUMN IF NOT EXISTS dynamic_choices JSONB,
  ADD COLUMN IF NOT EXISTS master_summary TEXT;
