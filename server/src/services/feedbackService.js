import { query } from './db.js';
import { normalizeProductEvent } from './productAnalytics.js';
import { generateUUID } from '../utils/id.js';

export const FEEDBACK_HELPFULNESS = new Set(['helpful', 'neutral', 'unhelpful']);
export const FEEDBACK_TAGS = new Set([
  'missed_point',
  'repetitive_advisors',
  'generic_conclusion',
  'too_slow',
  'unclear_controls',
  'destiny_card',
  'other',
]);

export function validateFeedbackPayload(payload = {}) {
  const helpfulness = String(payload.helpfulness || '').trim();
  if (!FEEDBACK_HELPFULNESS.has(helpfulness)) {
    const error = new Error('helpfulness 无效');
    error.code = 'INVALID_FEEDBACK';
    throw error;
  }
  if (!Array.isArray(payload.tags) || payload.tags.some((tag) => !FEEDBACK_TAGS.has(tag))) {
    const error = new Error('tags 无效');
    error.code = 'INVALID_FEEDBACK';
    throw error;
  }
  const comment = String(payload.comment || '').trim();
  if (comment.length > 800) {
    const error = new Error('comment 过长');
    error.code = 'INVALID_FEEDBACK';
    throw error;
  }
  return { helpfulness, tags: [...new Set(payload.tags)].slice(0, 7), comment };
}

export function publicFeedbackView(row = {}) {
  return {
    id: row.id,
    deliberationSessionId: row.deliberation_session_id,
    helpfulness: row.helpfulness,
    tags: row.tags,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertFeedback({ userId, sessionId, payload, metadata = {} }) {
  const clean = validateFeedbackPayload(payload);
  const existing = await query({
    table: 'product_feedback',
    action: 'select',
    filter: { user_id: userId, deliberation_session_id: sessionId },
    queryOptions: { limit: 1 },
  });
  const data = {
    helpfulness: clean.helpfulness,
    tags: clean.tags,
    comment: clean.comment,
    release_id: String(metadata.releaseId || '').slice(0, 80) || null,
    mode: metadata.mode === 'kiosk' ? 'kiosk' : 'standard',
    device_class: ['mobile', 'tablet', 'desktop'].includes(metadata.deviceClass) ? metadata.deviceClass : null,
  };
  let row;
  if (existing.rows[0]) {
    row = (await query({ table: 'product_feedback', action: 'update', id: existing.rows[0].id, data })).rows[0];
  } else {
    row = (await query({
      table: 'product_feedback',
      action: 'insert',
      data: {
        id: generateUUID(),
        user_id: userId,
        deliberation_session_id: sessionId,
        ...data,
        review_status: 'unread',
        internal_note: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })).rows[0];
  }

  const event = normalizeProductEvent({
    event: 'feedback_submitted',
    deliberationSessionId: sessionId,
    releaseId: metadata.releaseId,
    mode: metadata.mode,
    deviceClass: metadata.deviceClass,
    properties: { helpfulness: clean.helpfulness, tags: clean.tags, feedbackId: row.id },
  }, { principalId: userId });
  if (event) await query({ table: 'product_events', action: 'insert', data: event });
  return publicFeedbackView(row);
}

export default { publicFeedbackView, upsertFeedback, validateFeedbackPayload };
