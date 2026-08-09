ALTER TABLE cards ADD COLUMN IF NOT EXISTS source_session_id TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS reversal_conditions JSON DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS next_actions JSON DEFAULT '[]';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS evidence JSON DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_session
  ON cards(user_id, source_session_id)
  WHERE source_session_id IS NOT NULL;
