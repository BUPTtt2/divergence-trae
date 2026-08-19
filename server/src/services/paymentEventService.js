import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

function paymentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function applyVerifiedPaymentEvent(event, dependencies = {}) {
  if (!event?.provider || !event?.providerEventId || !event?.payloadHash) {
    throw paymentError('PAYMENT_EVENT_INVALID', '支付事件不完整');
  }
  if (typeof dependencies.verify !== 'function' || !(await dependencies.verify(event))) {
    throw paymentError('PAYMENT_SIGNATURE_INVALID', '支付签名无效');
  }
  const queryImpl = dependencies.queryImpl || query;
  const existing = await queryImpl({
    table: 'payment_events',
    action: 'select',
    filter: { provider: event.provider, provider_event_id: event.providerEventId },
    queryOptions: { limit: 1 },
  });
  if (existing.rows?.[0]) return { ...existing.rows[0], idempotentReplay: true };
  const now = new Date().toISOString();
  const stored = await queryImpl({
    table: 'payment_events',
    action: 'insert',
    data: {
      id: generateUUID(),
      provider: event.provider,
      provider_event_id: event.providerEventId,
      event_type: event.eventType || 'unknown',
      user_id: event.userId || null,
      order_id: event.orderId || null,
      amount_minor: Number.isInteger(event.amountMinor) ? event.amountMinor : null,
      currency: String(event.currency || '').slice(0, 8) || null,
      artwork_credits: Number.isInteger(event.artworkCredits) ? event.artworkCredits : 0,
      payload_hash: event.payloadHash,
      status: 'received',
      processed_at: null,
      created_at: now,
      updated_at: now,
    },
  });
  const row = stored.rows[0];
  if (row.artwork_credits > 0) {
    if (!row.user_id || typeof dependencies.grantCredits !== 'function') {
      await queryImpl({ table: 'payment_events', action: 'update', id: row.id, data: { status: 'failed', processed_at: now } });
      throw paymentError('PAYMENT_ENTITLEMENT_FAILED', '支付权益无法入账');
    }
    await dependencies.grantCredits({
      userId: row.user_id,
      amount: row.artwork_credits,
      idempotencyKey: `payment:${row.provider}:${row.provider_event_id}`,
      reason: `payment:${row.order_id || row.provider_event_id}`,
      actorId: `payment:${row.provider}`,
    });
  }
  const applied = await queryImpl({ table: 'payment_events', action: 'update', id: row.id, data: { status: 'applied', processed_at: now } });
  return applied.rows[0];
}

export default applyVerifiedPaymentEvent;
