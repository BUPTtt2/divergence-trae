ALTER TABLE decision_follow_ups
  ADD COLUMN IF NOT EXISTS outcome_status VARCHAR(16);
