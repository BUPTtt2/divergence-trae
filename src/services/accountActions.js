import { API_BASE_URL, getAccessTokenSync } from './baseConfig.js';

async function accountRequest(path, body, options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? API_BASE_URL;
  const token = options.token ?? getAccessTokenSync();
  const response = await (options.fetchImpl || fetch)(`${apiBaseUrl}/api/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || '账号服务暂不可用');
    error.code = payload.error || `HTTP_${response.status}`;
    throw error;
  }
  return payload;
}

export async function getAuthCapabilities(options) {
  const result = await accountRequest('capabilities', undefined, options);
  return result.providers || {};
}

export function requestPasswordReset(email, options) {
  return accountRequest('request-password-reset', { email }, options);
}

export function resetPassword(token, password, options) {
  return accountRequest('reset-password', { token, password }, options);
}

export function verifyEmail(token, options) {
  return accountRequest('verify-email', { token }, options);
}

export function requestEmailVerification(options) {
  return accountRequest('request-email-verification', {}, options);
}

export function changePassword(currentPassword, password, options) {
  return accountRequest('change-password', { currentPassword, password }, options);
}

export function getAccountData(options) {
  return accountRequest('export-data', undefined, options);
}
