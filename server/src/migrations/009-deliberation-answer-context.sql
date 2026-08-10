ALTER TABLE deliberation_sessions
  ADD COLUMN IF NOT EXISTS question_context TEXT,
  ADD COLUMN IF NOT EXISTS answers JSONB;
