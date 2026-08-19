import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeArtworkCredit,
  getArtworkEntitlement,
  grantArtworkCredits,
  refundArtworkCredit,
} from '../src/services/artworkEntitlementService.js';

test('credit grants are idempotent and balances never trust the client', async () => {
  const userId = `credit-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const first = await grantArtworkCredits({
    userId,
    amount: 3,
    idempotencyKey: `promo-${userId}`,
    reason: 'launch_promo',
    actorId: 'ops-user',
  });
  const replay = await grantArtworkCredits({
    userId,
    amount: 3,
    idempotencyKey: `promo-${userId}`,
    reason: 'launch_promo',
    actorId: 'ops-user',
  });
  assert.equal(first.artworkCredits, 3);
  assert.equal(replay.artworkCredits, 3);
  assert.equal(replay.idempotentReplay, true);
});

test('credit consumption is idempotent and a failed generation can refund once', async () => {
  const userId = `consume-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await grantArtworkCredits({ userId, amount: 1, idempotencyKey: `grant-${userId}`, reason: 'test', actorId: 'ops' });
  const consumed = await consumeArtworkCredit({ userId, idempotencyKey: 'art-job-1' });
  const replay = await consumeArtworkCredit({ userId, idempotencyKey: 'art-job-1' });
  assert.equal(consumed.artworkCredits, 0);
  assert.equal(replay.artworkCredits, 0);
  assert.equal(replay.idempotentReplay, true);

  const refunded = await refundArtworkCredit({ userId, idempotencyKey: 'art-job-1', reason: 'provider_failed' });
  const refundReplay = await refundArtworkCredit({ userId, idempotencyKey: 'art-job-1', reason: 'provider_failed' });
  assert.equal(refunded.artworkCredits, 1);
  assert.equal(refundReplay.artworkCredits, 1);
  assert.equal((await getArtworkEntitlement(userId)).artworkCredits, 1);
});

test('consumption fails clearly when no paid artwork credit remains', async () => {
  const userId = `empty-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await assert.rejects(
    () => consumeArtworkCredit({ userId, idempotencyKey: 'art-job-empty' }),
    (error) => error.code === 'ARTWORK_CREDIT_REQUIRED',
  );
});
