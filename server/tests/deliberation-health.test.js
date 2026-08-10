import test from 'node:test';
import assert from 'node:assert/strict';
import { probeDeliberationHealth } from '../../src/services/deliberationHealth.js';

test('health probe performs GET and never calls /start', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  };

  const result = await probeDeliberationHealth({
    fetchImpl,
    bases: ['http://localhost:3001'],
    timeoutMs: 50,
  });

  assert.deepEqual(result, { ok: true, base: 'http://localhost:3001' });
  assert.deepEqual(calls, [{
    url: 'http://localhost:3001/api/deliberation/health',
    method: 'GET',
  }]);
  assert.equal(calls.some((call) => call.url.includes('/start')), false);
});
