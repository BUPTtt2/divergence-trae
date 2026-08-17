import { pool, query } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveDays(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function retentionConfig(env = process.env) {
  return {
    eventDays: positiveDays(env.ANALYTICS_EVENT_RETENTION_DAYS, 90),
    feedbackDays: positiveDays(env.FEEDBACK_COMMENT_RETENTION_DAYS, 180),
  };
}

export function planAnalyticsRetention({ events = [], feedback = [], now = Date.now(), eventDays = 90, feedbackDays = 180 } = {}) {
  const eventCutoff = now - eventDays * DAY_MS;
  const feedbackCutoff = now - feedbackDays * DAY_MS;
  return {
    deleteEventIds: events.filter((row) => new Date(row.occurred_at).getTime() < eventCutoff).map((row) => row.id),
    redactFeedbackIds: feedback.filter((row) => row.comment && new Date(row.created_at).getTime() < feedbackCutoff).map((row) => row.id),
  };
}

export async function runAnalyticsRetention({ now = Date.now(), env = process.env } = {}) {
  const config = retentionConfig(env);
  if (pool) {
    const eventCutoff = new Date(now - config.eventDays * DAY_MS).toISOString();
    const feedbackCutoff = new Date(now - config.feedbackDays * DAY_MS).toISOString();
    const deleted = await pool.query('DELETE FROM product_events WHERE occurred_at < $1', [eventCutoff]);
    const redacted = await pool.query("UPDATE product_feedback SET comment = '', updated_at = NOW() WHERE created_at < $1 AND comment <> ''", [feedbackCutoff]);
    return { deletedEvents: deleted.rowCount || 0, redactedFeedback: redacted.rowCount || 0, ...config };
  }

  const [events, feedback] = await Promise.all([
    query({ table: 'product_events', action: 'select', filter: {}, queryOptions: { orderBy: 'occurred_at:asc' } }),
    query({ table: 'product_feedback', action: 'select', filter: {}, queryOptions: { orderBy: 'created_at:asc', limit: 200 } }),
  ]);
  const plan = planAnalyticsRetention({ events: events.rows, feedback: feedback.rows, now, ...config });
  for (const id of plan.deleteEventIds) await query({ table: 'product_events', action: 'delete', id });
  for (const id of plan.redactFeedbackIds) await query({ table: 'product_feedback', action: 'update', id, data: { comment: '' } });
  return { deletedEvents: plan.deleteEventIds.length, redactedFeedback: plan.redactFeedbackIds.length, ...config };
}

let retentionStarted = false;
export function startAnalyticsRetention() {
  if (retentionStarted) return;
  retentionStarted = true;
  const run = () => runAnalyticsRetention().catch((error) => console.warn('[analyticsRetention] 清理失败:', error.message));
  queueMicrotask(run);
  const timer = setInterval(run, DAY_MS);
  timer.unref?.();
}

export default { planAnalyticsRetention, retentionConfig, runAnalyticsRetention, startAnalyticsRetention };
