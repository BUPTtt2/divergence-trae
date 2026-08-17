ALTER TABLE product_events ADD COLUMN IF NOT EXISTS analytics_session_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS deliberation_session_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS release_id TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS device_class TEXT;
ALTER TABLE product_events ADD COLUMN IF NOT EXISTS platform_family TEXT;

UPDATE product_events
SET deliberation_session_id = session_id
WHERE deliberation_session_id IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_deliberation_time
  ON product_events(deliberation_session_id, occurred_at ASC);
CREATE INDEX IF NOT EXISTS idx_product_events_release_time
  ON product_events(release_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_mode_time
  ON product_events(mode, occurred_at DESC);

CREATE TABLE IF NOT EXISTS product_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  deliberation_session_id TEXT NOT NULL,
  helpfulness TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  comment TEXT NOT NULL DEFAULT '',
  release_id TEXT,
  mode TEXT NOT NULL DEFAULT 'standard',
  device_class TEXT,
  review_status TEXT NOT NULL DEFAULT 'unread',
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, deliberation_session_id)
);

CREATE INDEX IF NOT EXISTS idx_product_feedback_created
  ON product_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_feedback_review
  ON product_feedback(review_status, created_at DESC);
