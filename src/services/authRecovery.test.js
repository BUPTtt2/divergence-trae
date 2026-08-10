import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverAccessToken } from './authRecovery.js';

test('401 recovery prefers refresh and does not create a new anonymous identity', async () => {
  let anonymousCalls = 0;
  const token = await recoverAccessToken({
    refresh: async () => 'refreshed-token',
    anonymous: async () => {
      anonymousCalls += 1;
      return { accessToken: 'anonymous-token' };
    },
  });
  assert.equal(token, 'refreshed-token');
  assert.equal(anonymousCalls, 0);
});

test('401 recovery creates a new anonymous identity when refresh is unavailable', async () => {
  const token = await recoverAccessToken({
    refresh: async () => null,
    anonymous: async () => ({ accessToken: 'anonymous-token', offline: false }),
  });
  assert.equal(token, 'anonymous-token');
});

test('offline anonymous fallback never supplies a fake remote token', async () => {
  const token = await recoverAccessToken({
    refresh: async () => null,
    anonymous: async () => ({ accessToken: null, offline: true }),
  });
  assert.equal(token, null);
});
