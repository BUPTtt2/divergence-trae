import { query } from './db.js';
import { normalizeProductEvent } from './productAnalytics.js';
import crypto from 'crypto';
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
export const GENERAL_FEEDBACK_CATEGORIES = new Set(['bug', 'idea', 'confusing', 'other']);

function invalidGeneralFeedback(message) {
  const error = new Error(message);
  error.code = 'INVALID_FEEDBACK';
  return error;
}

export function validateGeneralFeedbackPayload(payload = {}) {
  const category = String(payload.category || '').trim();
  const message = String(payload.message || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const page = String(payload.page || '/').trim();
  if (!GENERAL_FEEDBACK_CATEGORIES.has(category)) throw invalidGeneralFeedback('category 无效');
  if (message.length < 4 || message.length > 800) throw invalidGeneralFeedback('message 长度无效');
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw invalidGeneralFeedback('email 无效');
  if (!page.startsWith('/') || page.length > 180) throw invalidGeneralFeedback('page 无效');
  return { category, message, email, page };
}

export function publicGeneralFeedbackView(row = {}) {
  return {
    id: row.id,
    category: row.category,
    message: row.message,
    email: row.email || '',
    page: row.page,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  };
}

export async function createGeneralFeedback({ payload, idempotencyKey, requestSubject = 'unknown' }) {
  const clean = validateGeneralFeedbackPayload(payload);
  const safeKey = String(idempotencyKey || '').trim().slice(0, 100);
  if (safeKey.length < 12) throw invalidGeneralFeedback('Idempotency-Key 缺失');
  const existing = await query({ table: 'feedback_inbox', action: 'select', filter: { idempotency_key: safeKey }, queryOptions: { limit: 1 } });
  if (existing.rows[0]) return { feedback: publicGeneralFeedbackView(existing.rows[0]), created: false };
  const now = new Date().toISOString();
  const fingerprint = crypto.createHash('sha256').update(`${clean.category}:${clean.message.toLowerCase()}`).digest('hex');
  const subjectHash = crypto.createHmac('sha256', process.env.FEEDBACK_HASH_SECRET || process.env.RATE_LIMIT_HASH_SECRET || 'local-feedback-only').update(String(requestSubject)).digest('hex');
  const row = (await query({
    table: 'feedback_inbox',
    action: 'insert',
    data: {
      id: generateUUID(),
      category: clean.category,
      message: clean.message,
      email: clean.email || null,
      page: clean.page,
      idempotency_key: safeKey,
      content_fingerprint: fingerprint,
      subject_hash: subjectHash,
      review_status: 'unread',
      internal_note: '',
      created_at: now,
      updated_at: now,
    },
  })).rows[0];
  return { feedback: publicGeneralFeedbackView(row), created: true };
}

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

export default { createGeneralFeedback, publicFeedbackView, publicGeneralFeedbackView, upsertFeedback, validateFeedbackPayload, validateGeneralFeedbackPayload };
