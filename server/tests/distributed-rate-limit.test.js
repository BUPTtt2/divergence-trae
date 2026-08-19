import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeRateLimit, hashRateLimitSubject } from '../src/services/distributedRateLimitService.js';
import { distributedRateLimit, resolveRateLimitSubject } from '../src/middleware/distributedRateLimit.js';

test('uses one atomic database window across independent callers', async () => {
  let count = 0;
  const calls = [];
  const queryImpl = async (request) => {
    calls.push(request);
    count += Number(request.params[5]);
    return { rows: [{ request_count: count }], rowCount: 1 };
  };
  const input = { scope: 'seedream', subject: 'user-1', windowSeconds: 60, limit: 2, cost: 1 };
  const first = await consumeRateLimit(input, { queryImpl, hashSecret: 'rate-secret', now: () => 120_000 });
  const second = await consumeRateLimit(input, { queryImpl, hashSecret: 'rate-secret', now: () => 120_001 });
  const denied = await consumeRateLimit(input, { queryImpl, hashSecret: 'rate-secret', now: () => 120_002 });

  assert.deepEqual([first.allowed, second.allowed, denied.allowed], [true, true, false]);
  assert.equal(calls.every((call) => !JSON.stringify(call).includes('user-1')), true);
  assert.match(calls[0].sql, /ON CONFLICT[\s\S]+request_count = rate_limit_windows\.request_count \+ EXCLUDED\.request_count/);
});

test('starts a new counter at the next fixed window boundary', async () => {
  const windows = new Map();
  const queryImpl = async ({ params }) => {
    const key = params[3];
    windows.set(key, (windows.get(key) || 0) + Number(params[5]));
    return { rows: [{ request_count: windows.get(key) }], rowCount: 1 };
  };
  const base = { scope: 'agent', subject: '198.51.100.8', windowSeconds: 60, limit: 1 };
  assert.equal((await consumeRateLimit(base, { queryImpl, hashSecret: 'secret', now: () => 59_999 })).allowed, true);
  assert.equal((await consumeRateLimit(base, { queryImpl, hashSecret: 'secret', now: () => 60_000 })).allowed, true);
});

test('hashes subjects with HMAC and refuses an unprotected production counter', async () => {
  assert.notEqual(hashRateLimitSubject('user-1', 'secret'), hashRateLimitSubject('user-1', 'different-secret'));
  await assert.rejects(
    () => consumeRateLimit({ scope: 'agent', subject: 'user-1', windowSeconds: 60, limit: 1 }, {
      queryImpl: async () => ({ rows: [], rowCount: 0 }),
      hashSecret: '',
    }),
    (error) => error.code === 'RATE_LIMIT_UNAVAILABLE',
  );
});

test('middleware accepts an explicit subject resolver instead of collapsing every public action to IP', () => {
  const req = { body: { email: ' Person@Example.COM ' }, ip: '198.51.100.2' };
  assert.equal(resolveRateLimitSubject(req, { subject: (request) => request.body.email.trim().toLowerCase() }), 'person@example.com');
  assert.equal(resolveRateLimitSubject(req, {}), '198.51.100.2');
});

test('denied middleware returns retry metadata from the shared counter', async () => {
  const middleware = distributedRateLimit({
    scope: 'login_email',
    subject: (request) => request.body.email,
    consume: async (input) => ({ allowed: false, remaining: 0, resetAt: new Date(Date.now() + 30_000).toISOString(), input }),
  });
  const headers = {};
  let responseBody;
  const res = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };
  await middleware({ method: 'POST', body: { email: 'person@example.com' } }, res, () => assert.fail('denied request must not continue'));

  assert.equal(res.statusCode, 429);
  assert.equal(headers['X-RateLimit-Remaining'], 0);
  assert.ok(Number(headers['Retry-After']) >= 1);
  assert.equal(responseBody.error, 'RATE_LIMITED');
});
