import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchOpsResource, loadOpsDashboard, reviewPublicFeedback } from './opsClient.js';

test('ops client always sends the signed administrator token', async () => {
  const calls = [];
  const result = await fetchOpsResource('overview', { days: 7, mode: 'kiosk' }, {
    baseUrl: 'https://api.example',
    token: 'admin-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ metrics: { starts: 1 } }) };
    },
  });
  assert.equal(result.metrics.starts, 1);
  assert.equal(calls[0].url, 'https://api.example/api/ops/overview?days=7&mode=kiosk');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-token');
});

test('ops dashboard requests the private cost ledger with the same filters', async () => {
  const urls = [];
  await loadOpsDashboard({ days: 7 }, {
    baseUrl: 'https://api.example',
    token: 'admin-token',
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(urls.includes('https://api.example/api/ops/costs?days=7'), true);
  assert.equal(urls.includes('https://api.example/api/ops/community-reports?days=7'), true);
  assert.equal(urls.includes('https://api.example/api/ops/public-feedback?days=7'), true);
});

test('public feedback review uses an authenticated patch request', async () => {
  const calls = [];
  const result = await reviewPublicFeedback('feedback/1', { reviewStatus: 'resolved', internalNote: '已修复' }, {
    baseUrl: 'https://api.example',
    token: 'admin-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ feedback: { id: 'feedback/1', review_status: 'resolved' } }) };
    },
  });
  assert.equal(result.feedback.review_status, 'resolved');
  assert.equal(calls[0].url, 'https://api.example/api/ops/public-feedback/feedback%2F1');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { reviewStatus: 'resolved', internalNote: '已修复' });
});
