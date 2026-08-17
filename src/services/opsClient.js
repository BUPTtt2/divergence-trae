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
  const resources = ['overview', 'funnel', 'reliability', 'sessions', 'feedback'];
  const [overview, funnel, reliability, sessions, feedback] = await Promise.all(
    resources.map((resource) => fetchOpsResource(resource, filters, options)),
  );
  return { overview, funnel, reliability, sessions, feedback };
}

export default loadOpsDashboard;
