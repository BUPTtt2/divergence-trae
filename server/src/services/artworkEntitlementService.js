import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

function entitlementError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeKey(userId, kind, value) {
  const key = String(value || '').trim().slice(0, 100);
  if (!key) throw entitlementError('ENTITLEMENT_IDEMPOTENCY_REQUIRED', '缺少权益请求标识');
  return `${kind}:${String(userId)}:${key}`;
}

function publicEntitlement(account, extra = {}) {
  return {
    plan: account?.plan || 'free',
    artworkCredits: Number(account?.artwork_credits || 0),
    ...extra,
  };
}

async function findLedger(idempotencyKey) {
  const result = await query({
    table: 'entitlement_ledger',
    action: 'select',
    filter: { idempotency_key: idempotencyKey },
    queryOptions: { limit: 1 },
  });
  return result.rows[0] || null;
}

async function ensureAccount(userId) {
  const current = await query({
    table: 'entitlement_accounts',
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { limit: 1 },
  });
  if (current.rows[0]) return current.rows[0];
  try {
    const created = await query({
      table: 'entitlement_accounts',
      action: 'insert',
      data: {
        id: String(userId),
        user_id: String(userId),
        plan: 'free',
        artwork_credits: 0,
        created_at: new Date().toISOString(),
      },
    });
    return created.rows[0];
  } catch {
    const raced = await query({
      table: 'entitlement_accounts',
      action: 'select',
      filter: { user_id: userId },
      queryOptions: { limit: 1 },
    });
    if (raced.rows[0]) return raced.rows[0];
    throw entitlementError('ENTITLEMENT_UNAVAILABLE', '权益服务暂不可用');
  }
}

async function changeBalance({ userId, delta, idempotencyKey, kind, reason, actorId }) {
  const existing = await findLedger(idempotencyKey);
  if (existing) {
    return publicEntitlement({ artwork_credits: existing.balance_after }, { idempotentReplay: true });
  }
  let account = await ensureAccount(userId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const currentBalance = Number(account.artwork_credits || 0);
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) throw entitlementError('ARTWORK_CREDIT_REQUIRED', '专属画境积分不足');
    const updated = await query({
      table: 'entitlement_accounts',
      action: 'compare-and-set',
      id: account.id,
      data: { artwork_credits: nextBalance },
      expected: { artwork_credits: currentBalance },
    });
    if (updated.rowCount === 1) {
      await query({
        table: 'entitlement_ledger',
        action: 'insert',
        data: {
          id: generateUUID(),
          user_id: String(userId),
          kind,
          delta,
          balance_after: nextBalance,
          idempotency_key: idempotencyKey,
          reason: String(reason || '').slice(0, 120),
          actor_id: actorId ? String(actorId).slice(0, 100) : null,
          created_at: new Date().toISOString(),
        },
      });
      return publicEntitlement(updated.rows[0]);
    }
    account = await ensureAccount(userId);
  }
  throw entitlementError('ENTITLEMENT_CONFLICT', '权益余额更新冲突，请重试');
}

export async function getArtworkEntitlement(userId) {
  if (!userId) throw entitlementError('AUTH_REQUIRED', 'AUTH_REQUIRED');
  return publicEntitlement(await ensureAccount(userId));
}

export async function grantArtworkCredits({ userId, amount, idempotencyKey, reason, actorId }) {
  const credits = Number(amount);
  if (!Number.isInteger(credits) || credits < 1 || credits > 1000) {
    throw entitlementError('ENTITLEMENT_AMOUNT_INVALID', '积分数量必须为 1-1000 的整数');
  }
  return changeBalance({
    userId,
    delta: credits,
    idempotencyKey: normalizeKey(userId, 'grant', idempotencyKey),
    kind: 'grant',
    reason,
    actorId,
  });
}

export async function consumeArtworkCredit({ userId, idempotencyKey }) {
  return changeBalance({
    userId,
    delta: -1,
    idempotencyKey: normalizeKey(userId, 'debit', idempotencyKey),
    kind: 'artwork_debit',
    reason: 'artwork_regeneration',
  });
}

export async function refundArtworkCredit({ userId, idempotencyKey, reason }) {
  const debitKey = normalizeKey(userId, 'debit', idempotencyKey);
  if (!await findLedger(debitKey)) return getArtworkEntitlement(userId);
  return changeBalance({
    userId,
    delta: 1,
    idempotencyKey: normalizeKey(userId, 'refund', idempotencyKey),
    kind: 'artwork_refund',
    reason,
  });
}

export default { getArtworkEntitlement, grantArtworkCredits, consumeArtworkCredit, refundArtworkCredit };
