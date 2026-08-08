import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAttemptTokenRefresh } from './apiAuthPolicy.js';

test('a stored refresh token is usable for anonymous and registered identities alike', () => {
  assert.equal(shouldAttemptTokenRefresh({
    refreshToken: 'signed-anonymous-refresh-token',
    userId: 'anon_server_identity',
  }), true);
  assert.equal(shouldAttemptTokenRefresh({
    refreshToken: 'signed-registered-refresh-token',
    userId: 'registered-user',
  }), true);
});

test('offline local identities without a refresh token do not trigger network refresh', () => {
  assert.equal(shouldAttemptTokenRefresh({ refreshToken: null, userId: 'local-offline-user' }), false);
  assert.equal(shouldAttemptTokenRefresh({ refreshToken: '', userId: 'anon_without_credentials' }), false);
});
