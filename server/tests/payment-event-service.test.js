import test from 'node:test';
import assert from 'node:assert/strict';

import { applyVerifiedPaymentEvent } from '../src/services/paymentEventService.js';

function paymentRepository() {
  const rows = [];
  return {
    rows,
    async query(request) {
      if (request.action === 'select') {
        const selected = rows.filter((row) => Object.entries(request.filter).every(([key, value]) => row[key] === value));
        return { rows: selected, rowCount: selected.length };
      }
      if (request.action === 'insert') { rows.push({ ...request.data }); return { rows: [request.data], rowCount: 1 }; }
      if (request.action === 'update') { const row = rows.find((item) => item.id === request.id); Object.assign(row, request.data); return { rows: [row], rowCount: 1 }; }
      return { rows: [], rowCount: 0 };
    },
  };
}

test('only verified payment events grant credits and provider replays are idempotent', async () => {
  const repository = paymentRepository();
  const grants = [];
  const event = {
    provider: 'verified_provider', providerEventId: 'evt-1', eventType: 'payment.succeeded',
    userId: 'user-1', orderId: 'order-1', amountMinor: 900, currency: 'CNY', artworkCredits: 3, payloadHash: 'sha256-payload',
  };
  await assert.rejects(
    () => applyVerifiedPaymentEvent(event, { queryImpl: repository.query, verify: async () => false, grantCredits: async () => {} }),
    (error) => error.code === 'PAYMENT_SIGNATURE_INVALID',
  );
  const first = await applyVerifiedPaymentEvent(event, {
    queryImpl: repository.query,
    verify: async () => true,
    grantCredits: async (input) => grants.push(input),
  });
  const replay = await applyVerifiedPaymentEvent(event, {
    queryImpl: repository.query,
    verify: async () => true,
    grantCredits: async (input) => grants.push(input),
  });
  assert.equal(first.status, 'applied');
  assert.equal(replay.idempotentReplay, true);
  assert.equal(grants.length, 1);
  assert.equal(JSON.stringify(repository.rows).includes('rawPayload'), false);
});
