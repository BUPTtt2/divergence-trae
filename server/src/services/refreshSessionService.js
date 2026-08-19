import crypto from 'crypto';

import { query } from './db.js';
import { issueTokenPair, verifyToken } from './authTokenService.js';
import { generateUUID } from '../utils/id.js';

function authRequired() {
  const error = new Error('AUTH_REQUIRED');
  error.code = 'AUTH_REQUIRED';
  return error;
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export async function createAuthSession(identity) {
  const pair = issueTokenPair(identity);
  const claims = verifyToken(pair.refreshToken, 'refresh');
  await query({
    table: 'refresh_tokens',
    action: 'insert',
    data: {
      id: generateUUID(),
      user_id: claims.sub,
      token_hash: hashRefreshToken(pair.refreshToken),
      expires_at: new Date(claims.exp * 1000).toISOString(),
      revoked: false,
      created_at: new Date().toISOString(),
    },
  });
  return pair;
}

export async function consumeRefreshSession(refreshToken) {
  const claims = verifyToken(refreshToken, 'refresh');
  const result = await query({
    table: 'refresh_tokens',
    action: 'select',
    filter: { token_hash: hashRefreshToken(refreshToken) },
    queryOptions: { limit: 1 },
  });
  const session = result.rows[0];
  if (!session || session.revoked || new Date(session.expires_at).getTime() <= Date.now()) {
    throw authRequired();
  }
  const consumed = await query({
    table: 'refresh_tokens',
    action: 'compare-and-set',
    id: session.id,
    data: { revoked: true },
    expected: { revoked: false },
  });
  if (consumed.rowCount !== 1) throw authRequired();
  return claims;
}

export async function revokeRefreshSession(refreshToken) {
  if (!refreshToken) return false;
  const result = await query({
    table: 'refresh_tokens',
    action: 'select',
    filter: { token_hash: hashRefreshToken(refreshToken) },
    queryOptions: { limit: 1 },
  });
  const session = result.rows[0];
  if (!session || session.revoked) return false;
  const revoked = await query({
    table: 'refresh_tokens',
    action: 'compare-and-set',
    id: session.id,
    data: { revoked: true },
    expected: { revoked: false },
  });
  return revoked.rowCount === 1;
}

export async function revokeAllRefreshSessions(userId) {
  if (!userId) return 0;
  const result = await query({
    table: 'refresh_tokens',
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { limit: 200 },
  });
  let revoked = 0;
  for (const session of result.rows) {
    if (session.revoked) continue;
    const update = await query({
      table: 'refresh_tokens',
      action: 'compare-and-set',
      id: session.id,
      data: { revoked: true },
      expected: { revoked: false },
    });
    revoked += update.rowCount;
  }
  return revoked;
}

export default { createAuthSession, consumeRefreshSession, revokeRefreshSession, revokeAllRefreshSessions };
