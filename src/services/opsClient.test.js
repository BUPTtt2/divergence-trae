import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchOpsResource } from './opsClient.js';

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
