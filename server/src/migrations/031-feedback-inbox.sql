CREATE TABLE IF NOT EXISTS feedback_inbox (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT,
  page TEXT NOT NULL DEFAULT '/',
  idempotency_key TEXT NOT NULL UNIQUE,
  content_fingerprint TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'unread',
  internal_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_inbox_review ON feedback_inbox(review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_inbox_fingerprint ON feedback_inbox(content_fingerprint, created_at DESC);
