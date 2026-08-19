import crypto from 'crypto';

import { query } from './db.js';

function rateLimitError() {
  const error = new Error('分布式限流服务暂不可用');
  error.code = 'RATE_LIMIT_UNAVAILABLE';
  return error;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function hashRateLimitSubject(subject, secret = process.env.RATE_LIMIT_HASH_SECRET) {
  if (!secret) throw rateLimitError();
  return crypto.createHmac('sha256', secret).update(String(subject || 'unknown'), 'utf8').digest('hex');
}

export async function consumeRateLimit(input, options = {}) {
  const scope = String(input?.scope || '').trim().slice(0, 80);
  if (!scope) throw rateLimitError();
  const windowSeconds = positiveInteger(input?.windowSeconds, 60);
  const limit = positiveInteger(input?.limit, 1);
  const cost = positiveInteger(input?.cost, 1);
  const nowMs = Number((options.now || Date.now)());
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const subjectHash = hashRateLimitSubject(input?.subject, options.hashSecret);
  const id = crypto.createHash('sha256').update(`${scope}:${subjectHash}:${windowStart}`).digest('hex');
  const queryImpl = options.queryImpl || query;
  const result = await queryImpl({
    action: 'raw',
    sql: `INSERT INTO rate_limit_windows
      (id, scope, subject_hash, window_start, window_seconds, request_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (scope, subject_hash, window_start)
      DO UPDATE SET request_count = rate_limit_windows.request_count + EXCLUDED.request_count, updated_at = NOW()
      RETURNING request_count`,
    params: [id, scope, subjectHash, windowStart, windowSeconds, cost],
  });
  const count = Number(result.rows?.[0]?.request_count);
  if (!Number.isFinite(count)) throw rateLimitError();
  return {
    allowed: count <= limit,
    used: count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(windowStartMs + windowMs).toISOString(),
  };
}

export function getDistributedRateLimitCapability(env = process.env) {
  const missing = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.RATE_LIMIT_HASH_SECRET) missing.push('RATE_LIMIT_HASH_SECRET');
  return {
    enabled: missing.length === 0,
    provider: 'postgresql',
    reason: missing.length > 0 ? `${missing.join('_AND_')}_MISSING` : null,
  };
}

export default consumeRateLimit;
