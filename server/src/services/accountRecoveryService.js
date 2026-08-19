import crypto from 'crypto';

import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const PURPOSES = new Set(['verify_email', 'reset_password']);

function accountTokenError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export async function createAccountActionToken(input, options = {}) {
  const purpose = String(input?.purpose || '');
  if (!input?.userId || !PURPOSES.has(purpose)) throw accountTokenError('ACCOUNT_TOKEN_INVALID', '认证链接无效');
  const nowMs = Number((options.now || Date.now)());
  const ttlSeconds = Number(input.ttlSeconds) > 0
    ? Number(input.ttlSeconds)
    : purpose === 'verify_email' ? 24 * 60 * 60 : 30 * 60;
  const token = options.randomToken ? options.randomToken() : crypto.randomBytes(32).toString('base64url');
  const queryImpl = options.queryImpl || query;
  const createdAt = new Date(nowMs).toISOString();
  const active = await queryImpl({
    table: 'account_action_tokens',
    action: 'select',
    filter: { user_id: input.userId, purpose },
    queryOptions: { limit: 50 },
  });
  for (const existing of active.rows || []) {
    if (existing.consumed_at) continue;
    await queryImpl({
      table: 'account_action_tokens',
      action: 'compare-and-set',
      id: existing.id,
      data: { consumed_at: createdAt, updated_at: createdAt },
      expected: { consumed_at: null },
    });
  }
  const row = {
    id: generateUUID(),
    user_id: input.userId,
    purpose,
    token_hash: tokenHash(token),
    request_hash: input.requestHash || null,
    expires_at: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    consumed_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  await queryImpl({ table: 'account_action_tokens', action: 'insert', data: row });
  return { token, expiresAt: row.expires_at, expiresInSeconds: ttlSeconds, purpose };
}

export async function consumeAccountActionToken(input, options = {}) {
  const purpose = String(input?.purpose || '');
  if (!input?.token || !PURPOSES.has(purpose)) throw accountTokenError('ACCOUNT_TOKEN_INVALID', '认证链接无效');
  const queryImpl = options.queryImpl || query;
  const result = await queryImpl({
    table: 'account_action_tokens',
    action: 'select',
    filter: { token_hash: tokenHash(input.token), purpose },
    queryOptions: { limit: 1 },
  });
  const row = result.rows?.[0];
  if (!row || row.consumed_at) throw accountTokenError('ACCOUNT_TOKEN_INVALID', '认证链接无效或已经使用');
  const nowMs = Number((options.now || Date.now)());
  if (new Date(row.expires_at).getTime() < nowMs) throw accountTokenError('ACCOUNT_TOKEN_EXPIRED', '认证链接已过期');
  const consumedAt = new Date(nowMs).toISOString();
  const consumed = await queryImpl({
    table: 'account_action_tokens',
    action: 'compare-and-set',
    id: row.id,
    data: { consumed_at: consumedAt },
    expected: { consumed_at: null },
  });
  if (consumed.rowCount !== 1) throw accountTokenError('ACCOUNT_TOKEN_INVALID', '认证链接无效或已经使用');
  return { userId: row.user_id, purpose, consumedAt };
}

export function hashRecoveryRequest(value, secret = process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(String(value || 'unknown'), 'utf8').digest('hex');
}

export default { createAccountActionToken, consumeAccountActionToken, hashRecoveryRequest };
