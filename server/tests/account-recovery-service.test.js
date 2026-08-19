import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccountActionToken, consumeAccountActionToken } from '../src/services/accountRecoveryService.js';

function tokenRepository() {
  const rows = [];
  return {
    rows,
    async query(request) {
      if (request.action === 'insert') { rows.push({ ...request.data }); return { rows: [request.data], rowCount: 1 }; }
      if (request.action === 'select') {
        const selected = rows.filter((row) => Object.entries(request.filter || {}).every(([key, value]) => row[key] === value));
        return { rows: selected.slice(0, request.queryOptions?.limit || selected.length), rowCount: selected.length };
      }
      if (request.action === 'compare-and-set') {
        const row = rows.find((item) => item.id === request.id);
        const matches = row && Object.entries(request.expected).every(([key, value]) => value === null ? row[key] == null : row[key] === value);
        if (!matches) return { rows: [], rowCount: 0 };
        Object.assign(row, request.data);
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test('account action tokens are one-time, purpose-bound, and stored only as hashes', async () => {
  const repository = tokenRepository();
  const issued = await createAccountActionToken({ userId: 'user-1', purpose: 'reset_password', requestHash: 'request-hash' }, {
    queryImpl: repository.query,
    now: () => 1_000,
    randomToken: () => 'raw-secret-token',
  });
  assert.equal(repository.rows[0].token_hash.includes('raw-secret-token'), false);
  await assert.rejects(
    () => consumeAccountActionToken({ token: issued.token, purpose: 'verify_email' }, { queryImpl: repository.query, now: () => 2_000 }),
    (error) => error.code === 'ACCOUNT_TOKEN_INVALID',
  );
  const consumed = await consumeAccountActionToken({ token: issued.token, purpose: 'reset_password' }, { queryImpl: repository.query, now: () => 2_000 });
  assert.equal(consumed.userId, 'user-1');
  await assert.rejects(
    () => consumeAccountActionToken({ token: issued.token, purpose: 'reset_password' }, { queryImpl: repository.query, now: () => 3_000 }),
    (error) => error.code === 'ACCOUNT_TOKEN_INVALID',
  );
});

test('expired account action tokens cannot be consumed', async () => {
  const repository = tokenRepository();
  const issued = await createAccountActionToken({ userId: 'user-1', purpose: 'verify_email', ttlSeconds: 1 }, {
    queryImpl: repository.query,
    now: () => 1_000,
    randomToken: () => 'expiring-token',
  });
  await assert.rejects(
    () => consumeAccountActionToken({ token: issued.token, purpose: 'verify_email' }, { queryImpl: repository.query, now: () => 2_001 }),
    (error) => error.code === 'ACCOUNT_TOKEN_EXPIRED',
  );
});

test('issuing a new token invalidates the previous active token for the same purpose', async () => {
  const repository = tokenRepository();
  const first = await createAccountActionToken({ userId: 'user-1', purpose: 'reset_password' }, {
    queryImpl: repository.query,
    now: () => 1_000,
    randomToken: () => 'first-reset-token',
  });
  const second = await createAccountActionToken({ userId: 'user-1', purpose: 'reset_password' }, {
    queryImpl: repository.query,
    now: () => 2_000,
    randomToken: () => 'second-reset-token',
  });

  await assert.rejects(
    () => consumeAccountActionToken({ token: first.token, purpose: 'reset_password' }, { queryImpl: repository.query, now: () => 3_000 }),
    (error) => error.code === 'ACCOUNT_TOKEN_INVALID',
  );
  assert.equal((await consumeAccountActionToken({ token: second.token, purpose: 'reset_password' }, { queryImpl: repository.query, now: () => 3_000 })).userId, 'user-1');
});

test('default token expiry is explicit in the issued contract', async () => {
  const repository = tokenRepository();
  const reset = await createAccountActionToken({ userId: 'user-1', purpose: 'reset_password' }, {
    queryImpl: repository.query,
    now: () => 1_000,
    randomToken: () => 'reset-token',
  });
  const verification = await createAccountActionToken({ userId: 'user-2', purpose: 'verify_email' }, {
    queryImpl: repository.query,
    now: () => 1_000,
    randomToken: () => 'verification-token',
  });

  assert.equal(reset.expiresInSeconds, 30 * 60);
  assert.equal(verification.expiresInSeconds, 24 * 60 * 60);
});
