import test from 'node:test';
import assert from 'node:assert/strict';

import { getAccountData, getAuthCapabilities, requestPasswordReset, resetPassword } from './accountActions.js';

test('account actions use real capability and reset endpoints', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/capabilities')) return { ok: true, async json() { return { providers: { email: { enabled: false } } }; } };
    return { ok: true, status: 200, async json() { return { ok: true }; } };
  };
  const capabilities = await getAuthCapabilities({ apiBaseUrl: 'https://api.example', fetchImpl });
  assert.equal(capabilities.email.enabled, false);
  await requestPasswordReset('person@example.com', { apiBaseUrl: 'https://api.example', fetchImpl });
  await resetPassword('one-time-token', 'new-password-123', { apiBaseUrl: 'https://api.example', fetchImpl });
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.example/api/auth/capabilities',
    'https://api.example/api/auth/request-password-reset',
    'https://api.example/api/auth/reset-password',
  ]);
  assert.equal(JSON.parse(calls[2].options.body).token, 'one-time-token');
});

test('account export uses an authenticated read request', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, async json() { return { schemaVersion: 1, data: {} }; } };
  };
  const archive = await getAccountData({ apiBaseUrl: 'https://api.example', token: 'access-token', fetchImpl });
  assert.equal(archive.schemaVersion, 1);
  assert.equal(calls[0].url, 'https://api.example/api/auth/export-data');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer access-token');
});

test('account action failures preserve server error codes for honest UI states', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, async json() { return { error: 'EMAIL_DELIVERY_UNAVAILABLE' }; } });
  await assert.rejects(
    () => requestPasswordReset('person@example.com', { apiBaseUrl: '', fetchImpl }),
    (error) => error.code === 'EMAIL_DELIVERY_UNAVAILABLE',
  );
});
