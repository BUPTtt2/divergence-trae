CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'privacy', 'misinformation', 'self_harm', 'other')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'reviewing', 'resolved', 'dismissed')),
  reviewer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status_created
  ON community_reports(status, created_at DESC);
