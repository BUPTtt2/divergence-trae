ALTER TABLE cards
ADD COLUMN IF NOT EXISTS replay JSONB NOT NULL DEFAULT '{"schemaVersion":1,"completeness":"partial","events":[]}'::jsonb;

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS replay_schema_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS replay_completeness TEXT NOT NULL DEFAULT 'partial';

CREATE INDEX IF NOT EXISTS idx_cards_replay_completeness
ON cards(user_id, replay_completeness, created_at DESC);
