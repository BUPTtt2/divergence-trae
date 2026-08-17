import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAdminPrincipal,
  parseAdminUserIds,
  requireAdmin,
} from '../src/middleware/admin.js';

test('requireAdmin accepts only exact server-side allowlist matches', () => {
  const ids = parseAdminUserIds('owner-1, owner-2\nowner-3');
  assert.deepEqual([...ids], ['owner-1', 'owner-2', 'owner-3']);
  assert.equal(isAdminPrincipal({ userId: 'owner-2', kind: 'registered' }, ids), true);
  assert.equal(isAdminPrincipal({ userId: 'owner-2', kind: 'anonymous' }, ids), false);
  assert.equal(isAdminPrincipal({ userId: 'owner', kind: 'registered' }, ids), false);
  assert.equal(isAdminPrincipal(null, ids), false);
});

test('requireAdmin returns a stable 403 contract without leaking the allowlist', () => {
  const previous = process.env.ADMIN_USER_IDS;
  process.env.ADMIN_USER_IDS = 'owner-1';
  const response = {
    statusCode: 0,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  let nextCalled = false;

  requireAdmin({ principal: { userId: 'visitor-1', kind: 'registered' } }, response, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.payload, { error: 'ADMIN_REQUIRED' });
  if (previous === undefined) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = previous;
});
