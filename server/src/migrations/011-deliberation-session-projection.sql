ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS conflicts JSONB;
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS gaps JSONB;
