import { API_BASE_URL, getAccessTokenSync } from './baseConfig.js';

export async function fetchOpsResource(resource, params = {}, options = {}) {
  const token = options.token ?? getAccessTokenSync();
  if (!token) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
  const query = search.toString();
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const response = await (options.fetchImpl || fetch)(`${baseUrl}/api/ops/${resource}${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'OPS_REQUEST_FAILED');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function loadOpsDashboard(filters = {}, options = {}) {
  const resources = ['overview', 'funnel', 'reliability', 'sessions', 'feedback', 'public-feedback', 'infrastructure', 'costs', 'community-reports'];
  const [overview, funnel, reliability, sessions, feedback, publicFeedback, infrastructure, costs, communityReports] = await Promise.all(
    resources.map((resource) => fetchOpsResource(resource, filters, options)),
  );
  return { overview, funnel, reliability, sessions, feedback, publicFeedback, infrastructure, costs, communityReports };
}

export async function reviewCommunityReport(reportId, { status, internalNote = '' }, options = {}) {
  const token = options.token ?? getAccessTokenSync();
  if (!token) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const response = await (options.fetchImpl || fetch)(`${baseUrl}/api/ops/community-reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, internalNote }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'REPORT_REVIEW_FAILED'), { status: response.status });
  return data;
}

export async function reviewPublicFeedback(feedbackId, { reviewStatus, internalNote = '' }, options = {}) {
  const token = options.token ?? getAccessTokenSync();
  if (!token) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const response = await (options.fetchImpl || fetch)(`${baseUrl}/api/ops/public-feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewStatus, internalNote }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'FEEDBACK_REVIEW_FAILED'), { status: response.status });
  return data;
}

export async function grantOpsArtworkCredits({ userId, amount, reason, idempotencyKey }, options = {}) {
  const token = options.token ?? getAccessTokenSync();
  if (!token) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const response = await (options.fetchImpl || fetch)(`${baseUrl}/api/ops/entitlements/${encodeURIComponent(userId)}/grants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, reason, idempotencyKey }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'ENTITLEMENT_GRANT_FAILED');
    error.status = response.status;
    throw error;
  }
  return data;
}

export default loadOpsDashboard;
