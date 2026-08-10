ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS execute_action_id TEXT;
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS execute_status TEXT;
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS execute_claim_token TEXT;
ALTER TABLE deliberation_sessions ADD COLUMN IF NOT EXISTS execute_lease_expires_at BIGINT;
