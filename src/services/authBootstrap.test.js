import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAuthBootstrap } from './authBootstrap.js';

test('offline cached identities retry anonymous authentication on the next startup', () => {
  assert.equal(decideAuthBootstrap({
    token: null,
    cachedUser: { id: 'local-user', anonymous: true, offline: true },
    tokenExpiring: true,
  }), 'anonymous');
});

test('valid cached identities stay local while expiring tokens refresh', () => {
  assert.equal(decideAuthBootstrap({
    token: 'valid-access-token',
    cachedUser: { id: 'user-1', anonymous: true },
    tokenExpiring: false,
  }), 'cached');
  assert.equal(decideAuthBootstrap({
    token: 'expiring-access-token',
    cachedUser: { id: 'user-1', anonymous: true },
    tokenExpiring: true,
  }), 'refresh');
});
