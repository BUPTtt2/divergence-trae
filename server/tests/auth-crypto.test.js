import test from 'node:test';
import assert from 'node:assert/strict';

import {
  issueTokenPair,
  verifyToken,
} from '../src/services/authTokenService.js';
import {
  hashPassword,
  verifyPassword,
} from '../src/services/passwordService.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long';

test('signed access token cannot be forged by changing its subject', () => {
  const pair = issueTokenPair(
    { userId: 'user_a', kind: 'anonymous' },
    { secret: TEST_SECRET, now: 1_000 },
  );
  const parts = pair.accessToken.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: 'user_b' })).toString('base64url');

  assert.throws(
    () => verifyToken(parts.join('.'), 'access', { secret: TEST_SECRET, now: 1_001 }),
    (error) => error?.code === 'AUTH_REQUIRED',
  );
});

test('refresh token is rejected where an access token is required', () => {
  const pair = issueTokenPair(
    { userId: 'user_a', kind: 'registered' },
    { secret: TEST_SECRET, now: 1_000 },
  );

  assert.throws(
    () => verifyToken(pair.refreshToken, 'access', { secret: TEST_SECRET, now: 1_001 }),
    (error) => error?.code === 'AUTH_REQUIRED',
  );
});

test('expired access token is rejected', () => {
  const pair = issueTokenPair(
    { userId: 'user_a', kind: 'anonymous' },
    { secret: TEST_SECRET, now: 1_000, accessTtlSeconds: 10 },
  );

  assert.throws(
    () => verifyToken(pair.accessToken, 'access', { secret: TEST_SECRET, now: 1_011 }),
    (error) => error?.code === 'AUTH_REQUIRED',
  );
});

test('scrypt password hash excludes plaintext and verifies only the right password', async () => {
  const password = 'correct horse battery staple';
  const encoded = await hashPassword(password);

  assert.equal(encoded.includes(password), false);
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword('wrong password', encoded), false);
  assert.equal(await verifyPassword(password, 'legacy-plaintext'), false);
});
