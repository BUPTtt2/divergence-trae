import { API_BASE_URL, getAccessTokenSync } from './baseConfig.js';
import { createTrackingContext } from './tracker.js';

export const DECISION_FEEDBACK_TAGS = new Set([
  'missed_point', 'repetitive_advisors', 'generic_conclusion', 'too_slow',
  'unclear_controls', 'destiny_card', 'other',
]);

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

export default submitDecisionFeedback;
