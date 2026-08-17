import test from 'node:test';
import assert from 'node:assert/strict';

import { planAnalyticsRetention, retentionConfig } from '../src/services/analyticsRetention.js';

const DAY = 24 * 60 * 60 * 1000;

test('retention deletes expired raw events and redacts only old feedback comments', () => {
  const now = Date.UTC(2026, 7, 12);
  const plan = planAnalyticsRetention({
    events: [
      { id: 'old-event', occurred_at: new Date(now - 91 * DAY).toISOString() },
      { id: 'fresh-event', occurred_at: new Date(now - 89 * DAY).toISOString() },
    ],
    feedback: [
      { id: 'old-feedback', comment: 'private', created_at: new Date(now - 181 * DAY).toISOString() },
      { id: 'fresh-feedback', comment: 'keep', created_at: new Date(now - 179 * DAY).toISOString() },
    ],
    now,
    eventDays: 90,
    feedbackDays: 180,
  });
  assert.deepEqual(plan.deleteEventIds, ['old-event']);
  assert.deepEqual(plan.redactFeedbackIds, ['old-feedback']);
});

test('invalid retention environment values fall back to safe defaults', () => {
  assert.deepEqual(retentionConfig({ ANALYTICS_EVENT_RETENTION_DAYS: '0', FEEDBACK_COMMENT_RETENTION_DAYS: 'invalid' }), {
    eventDays: 90,
    feedbackDays: 180,
  });
});
