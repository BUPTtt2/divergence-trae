import { API_BASE_URL, getAccessTokenSync } from './baseConfig.js';
import { createTrackingContext } from './tracker.js';

export const DECISION_FEEDBACK_TAGS = new Set([
  'missed_point', 'repetitive_advisors', 'generic_conclusion', 'too_slow',
  'unclear_controls', 'destiny_card', 'other',
]);

export const GENERAL_FEEDBACK_CATEGORIES = new Set(['bug', 'idea', 'confusing', 'other']);

export function normalizeFeedbackPayload(payload = {}) {
  return {
    helpfulness: ['helpful', 'neutral', 'unhelpful'].includes(payload.helpfulness) ? payload.helpfulness : '',
    tags: [...new Set(Array.isArray(payload.tags) ? payload.tags.filter((tag) => DECISION_FEEDBACK_TAGS.has(tag)) : [])],
    comment: String(payload.comment || '').trim().slice(0, 800),
  };
}

export async function submitDecisionFeedback(sessionId, payload, options = {}) {
  const token = options.token ?? getAccessTokenSync();
  if (!token) throw new Error('AUTH_REQUIRED');
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${baseUrl}/api/feedback/${encodeURIComponent(sessionId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...normalizeFeedbackPayload(payload), ...createTrackingContext() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'FEEDBACK_FAILED');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function normalizeGeneralFeedback(payload = {}) {
  const email = String(payload.email || '').trim().toLowerCase().slice(0, 254);
  return {
    category: GENERAL_FEEDBACK_CATEGORIES.has(payload.category) ? payload.category : 'other',
    message: String(payload.message || '').trim().slice(0, 800),
    email,
    page: String(payload.page || '/').trim().slice(0, 180) || '/',
  };
}

export async function submitGeneralFeedback(payload, options = {}) {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const fetchImpl = options.fetchImpl || fetch;
  const idempotencyKey = options.idempotencyKey || crypto.randomUUID();
  const response = await fetchImpl(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      ...normalizeGeneralFeedback(payload),
      website: String(payload?.website || '').slice(0, 120),
      interactionMs: Math.max(0, Number(payload?.interactionMs || 0)),
      ...createTrackingContext(),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || 'FEEDBACK_FAILED');
    error.status = response.status;
    throw error;
  }
  return data;
}

export default submitDecisionFeedback;
