ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS cognitive_plan JSONB;
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS lens_impacts JSONB;
