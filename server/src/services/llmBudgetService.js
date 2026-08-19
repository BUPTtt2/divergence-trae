import crypto from 'node:crypto';

import { consumeRateLimit, getDistributedRateLimitCapability } from './distributedRateLimitService.js';
import { query } from './db.js';

const DEFAULT_SESSION_TOKEN_ENVELOPE = 250_000;
const DEFAULT_USER_DAILY_SESSION_LIMIT = 3;
const DEFAULT_GLOBAL_DAILY_SESSION_LIMIT = 100;
const DEFAULT_MAX_ACTIVE_SESSIONS = 20;
const DEFAULT_USER_MAX_ACTIVE_SESSIONS = 1;
const DEFAULT_RESERVATION_TTL_SECONDS = 2 * 60 * 60;
const DEFAULT_ENTRY_DAILY_TOKEN_BUDGET = 50_000;
const DEFAULT_SESSION_EMERGENCY_TOKEN_LIMIT = 1_000_000;
const MESSAGE_OVERHEAD_TOKENS = 16;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function contentTokens(content) {
  const value = typeof content === 'string' ? content : JSON.stringify(content || '');
  let ascii = 0;
  let nonAscii = 0;
  for (const character of value) {
    if (character.codePointAt(0) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4) + nonAscii;
}

export function estimateTokenReservation(messages = [], maxTokens = 400) {
  const input = (Array.isArray(messages) ? messages : []).reduce(
    (total, message) => total + MESSAGE_OVERHEAD_TOKENS + contentTokens(message?.content),
    0,
  );
  return Math.max(1, input + positiveInteger(maxTokens, 400));
}

function budgetError(code, message, result = {}) {
  const error = new Error(message);
  error.code = code;
  error.retryAt = result.resetAt || null;
  error.retryable = result.retryable === true;
  return error;
}

function capacityError(decision) {
  if (decision === 'user_daily_limit') {
    return budgetError('LLM_DAILY_SESSIONS_EXCEEDED', '今日完整推演次数已用完', { retryable: false });
  }
  if (decision === 'user_active_limit') {
    return budgetError('LLM_SESSION_IN_PROGRESS', '当前账号已有一局推演进行中', { retryable: true });
  }
  if (decision === 'global_daily_limit') {
    return budgetError('LLM_CAPACITY_EXCEEDED', '今日公测推演名额已满', { retryable: false });
  }
  return budgetError('LLM_CAPACITY_BUSY', '当前推演席位暂满，已开始的推演不受影响', { retryable: true });
}

const SESSION_ADMISSION_SQL = `WITH capacity_lock AS (
  SELECT pg_advisory_xact_lock(hashtext('llm_capacity_admission'))
), expired AS (
  UPDATE llm_capacity_reservations
  SET status = 'expired', released_reason = 'reservation_ttl', updated_at = NOW()
  FROM capacity_lock
  WHERE status = 'active' AND expires_at <= NOW()
  RETURNING session_id
), current_reservation AS (
  SELECT reservation.*
  FROM llm_capacity_reservations reservation
  CROSS JOIN capacity_lock
  WHERE reservation.session_id = $1
), capacity AS (
  SELECT
    (SELECT COUNT(*)::int FROM llm_capacity_reservations
      WHERE user_id = $2 AND status IN ('active', 'settled')
        AND created_at >= date_trunc('day', NOW())) AS user_daily_sessions,
    (SELECT COUNT(*)::int FROM llm_capacity_reservations
      WHERE status IN ('active', 'settled')
        AND created_at >= date_trunc('day', NOW())) AS global_daily_sessions,
    (SELECT COUNT(*)::int FROM llm_capacity_reservations
      WHERE status = 'active' AND expires_at > NOW()) AS active_sessions,
    (SELECT COUNT(*)::int FROM llm_capacity_reservations
      WHERE user_id = $2 AND status = 'active' AND expires_at > NOW()) AS user_active_sessions
  FROM capacity_lock
), inserted AS (
  INSERT INTO llm_capacity_reservations
    (id, session_id, user_id, status, reserved_tokens, actual_tokens, expires_at, created_at, updated_at)
  SELECT $9, $1, $2, 'active', $3, 0, NOW() + ($8 * INTERVAL '1 second'), NOW(), NOW()
  FROM capacity
  WHERE NOT EXISTS (SELECT 1 FROM current_reservation)
    AND user_daily_sessions < $4
    AND global_daily_sessions < $5
    AND active_sessions < $6
    AND user_active_sessions < $7
  ON CONFLICT (session_id) DO NOTHING
  RETURNING *
), chosen AS (
  SELECT row_to_json(current_reservation) AS reservation, 'existing'::text AS decision
  FROM current_reservation
  UNION ALL
  SELECT row_to_json(inserted) AS reservation, 'created'::text AS decision
  FROM inserted
  LIMIT 1
)
SELECT
  chosen.reservation,
  COALESCE(chosen.decision,
    CASE
      WHEN capacity.user_daily_sessions >= $4 THEN 'user_daily_limit'
      WHEN capacity.global_daily_sessions >= $5 THEN 'global_daily_limit'
      WHEN capacity.user_active_sessions >= $7 THEN 'user_active_limit'
      ELSE 'global_active_limit'
    END
  ) AS decision,
  capacity.user_daily_sessions,
  capacity.global_daily_sessions,
  capacity.active_sessions,
  capacity.user_active_sessions
FROM capacity
LEFT JOIN chosen ON TRUE`;

async function reserveSession(input, options, env) {
  const sessionId = String(input.sessionId || '').trim().slice(0, 160);
  const userId = String(input.userId || 'unattributed').trim().slice(0, 160);
  const queryImpl = options.queryImpl || query;
  const envelope = positiveInteger(env.LLM_SESSION_TOKEN_ENVELOPE, DEFAULT_SESSION_TOKEN_ENVELOPE);
  const params = [
    sessionId,
    userId,
    envelope,
    positiveInteger(env.LLM_USER_DAILY_SESSION_LIMIT, DEFAULT_USER_DAILY_SESSION_LIMIT),
    positiveInteger(env.LLM_GLOBAL_DAILY_SESSION_LIMIT, DEFAULT_GLOBAL_DAILY_SESSION_LIMIT),
    positiveInteger(env.LLM_MAX_ACTIVE_SESSIONS, DEFAULT_MAX_ACTIVE_SESSIONS),
    positiveInteger(env.LLM_USER_MAX_ACTIVE_SESSIONS, DEFAULT_USER_MAX_ACTIVE_SESSIONS),
    positiveInteger(env.LLM_RESERVATION_TTL_SECONDS, DEFAULT_RESERVATION_TTL_SECONDS),
    `llm_capacity_${crypto.randomUUID()}`,
  ];
  const result = await queryImpl({ action: 'raw', sql: SESSION_ADMISSION_SQL, params });
  const row = result.rows?.[0] || {};
  const reservation = row.reservation;
  if (!reservation) throw capacityError(row.decision);
  if (!['active', 'settled'].includes(reservation.status)) {
    throw budgetError('LLM_SESSION_CLOSED', '该局推演已结束，请新开一局', { retryable: false });
  }
  const actualTokens = Number(reservation.actual_tokens) || 0;
  const emergencyLimit = positiveInteger(
    env.LLM_SESSION_EMERGENCY_TOKEN_LIMIT,
    DEFAULT_SESSION_EMERGENCY_TOKEN_LIMIT,
  );
  if (actualTokens >= emergencyLimit) {
    throw budgetError(
      'LLM_SESSION_SAFETY_STOP',
      '该局资源消耗异常，已停止继续请求并保留当前记录',
      { retryable: false },
    );
  }
  return {
    enabled: true,
    reservedTokens: Number(reservation.reserved_tokens) || envelope,
    actualTokens,
    status: reservation.status,
    decision: row.decision,
    capacity: {
      userDailySessions: Number(row.user_daily_sessions) || 0,
      globalDailySessions: Number(row.global_daily_sessions) || 0,
      activeSessions: Number(row.active_sessions) || 0,
      userActiveSessions: Number(row.user_active_sessions) || 0,
    },
  };
}

export async function reserveLlmBudget(input = {}, options = {}) {
  const env = options.env || process.env;
  const capability = getDistributedRateLimitCapability(env);
  if (!capability.enabled) {
    if (env.NODE_ENV === 'production') throw budgetError('LLM_BUDGET_UNAVAILABLE', '模型容量保护暂不可用');
    return { enabled: false, reservedTokens: 0, reason: 'distributed_budget_unavailable' };
  }

  if (input.sessionId) return reserveSession(input, options, env);

  const consumeImpl = options.consumeImpl || consumeRateLimit;
  const reservedTokens = estimateTokenReservation(input.messages, input.maxTokens);
  const entryLimit = positiveInteger(env.LLM_ENTRY_DAILY_TOKEN_BUDGET, DEFAULT_ENTRY_DAILY_TOKEN_BUDGET);
  const userId = String(input.userId || 'unattributed');
  const user = await consumeImpl({
    scope: 'llm_entry_token_day',
    subject: userId,
    windowSeconds: 86400,
    limit: entryLimit,
    cost: reservedTokens,
  });
  if (!user.allowed) throw budgetError('LLM_ENTRY_BUDGET_EXCEEDED', '今日入口分析次数已达上限', user);

  return { enabled: true, reservedTokens, user };
}

export async function recordLlmUsage(sessionId, totalTokens, options = {}) {
  const cleanSessionId = String(sessionId || '').trim().slice(0, 160);
  const tokens = Math.max(0, Math.round(Number(totalTokens) || 0));
  if (!cleanSessionId || tokens === 0) return { updated: false, actualTokens: 0 };
  const queryImpl = options.queryImpl || query;
  const result = await queryImpl({
    action: 'raw',
    sql: `UPDATE llm_capacity_reservations
      SET actual_tokens = actual_tokens + $2, updated_at = NOW()
      WHERE session_id = $1 AND status IN ('active', 'settled')
      RETURNING session_id, actual_tokens`,
    params: [cleanSessionId, tokens],
  });
  return { updated: result.rowCount === 1, actualTokens: Number(result.rows?.[0]?.actual_tokens) || 0 };
}

export async function releaseLlmSessionBudget(sessionId, reason = 'terminal_failure', options = {}) {
  const queryImpl = options.queryImpl || query;
  const result = await queryImpl({
    action: 'raw',
    sql: `UPDATE llm_capacity_reservations
      SET status = 'released', released_reason = $2, settled_at = NOW(), updated_at = NOW()
      WHERE session_id = $1 AND status = 'active'
      RETURNING session_id, status`,
    params: [String(sessionId || '').trim().slice(0, 160), String(reason || 'terminal_failure').slice(0, 120)],
  });
  return { released: result.rowCount === 1, reservation: result.rows?.[0] || null };
}

export async function settleLlmSessionBudget(sessionId, options = {}) {
  const queryImpl = options.queryImpl || query;
  const result = await queryImpl({
    action: 'raw',
    sql: `UPDATE llm_capacity_reservations
      SET status = 'settled', settled_at = NOW(), updated_at = NOW()
      WHERE session_id = $1 AND status = 'active'
      RETURNING session_id, status, reserved_tokens, actual_tokens`,
    params: [String(sessionId || '').trim().slice(0, 160)],
  });
  return { settled: result.rowCount === 1, reservation: result.rows?.[0] || null };
}

export function getLlmCapacityLimits(env = process.env) {
  return {
    sessionTokenEnvelope: positiveInteger(env.LLM_SESSION_TOKEN_ENVELOPE, DEFAULT_SESSION_TOKEN_ENVELOPE),
    userDailySessions: positiveInteger(env.LLM_USER_DAILY_SESSION_LIMIT, DEFAULT_USER_DAILY_SESSION_LIMIT),
    globalDailySessions: positiveInteger(env.LLM_GLOBAL_DAILY_SESSION_LIMIT, DEFAULT_GLOBAL_DAILY_SESSION_LIMIT),
    maxActiveSessions: positiveInteger(env.LLM_MAX_ACTIVE_SESSIONS, DEFAULT_MAX_ACTIVE_SESSIONS),
    userMaxActiveSessions: positiveInteger(env.LLM_USER_MAX_ACTIVE_SESSIONS, DEFAULT_USER_MAX_ACTIVE_SESSIONS),
    sessionEmergencyTokenLimit: positiveInteger(
      env.LLM_SESSION_EMERGENCY_TOKEN_LIMIT,
      DEFAULT_SESSION_EMERGENCY_TOKEN_LIMIT,
    ),
  };
}

export async function getLlmCapacitySummary(range = {}, options = {}) {
  const queryImpl = options.queryImpl || query;
  const from = new Date(range.from).toISOString();
  const to = new Date(range.to).toISOString();
  const result = await queryImpl({
    action: 'raw',
    sql: `SELECT
      COUNT(*)::int AS reservations,
      (SELECT COUNT(*)::int FROM llm_capacity_reservations WHERE status = 'active' AND expires_at > NOW()) AS active_sessions,
      COUNT(*) FILTER (WHERE status = 'settled')::int AS settled_sessions,
      COUNT(*) FILTER (WHERE status = 'released')::int AS released_sessions,
      COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_sessions,
      COALESCE(SUM(reserved_tokens), 0)::bigint AS reserved_tokens,
      COALESCE(SUM(actual_tokens), 0)::bigint AS actual_tokens,
      COALESCE(percentile_disc(0.5) WITHIN GROUP (ORDER BY actual_tokens) FILTER (WHERE actual_tokens > 0), 0)::bigint AS p50_actual_tokens,
      COALESCE(percentile_disc(0.9) WITHIN GROUP (ORDER BY actual_tokens) FILTER (WHERE actual_tokens > 0), 0)::bigint AS p90_actual_tokens
    FROM llm_capacity_reservations
    WHERE created_at >= $1 AND created_at <= $2`,
    params: [from, to],
  });
  const row = result.rows?.[0] || {};
  return {
    limits: getLlmCapacityLimits(options.env || process.env),
    observed: {
      reservations: Number(row.reservations) || 0,
      activeSessions: Number(row.active_sessions) || 0,
      settledSessions: Number(row.settled_sessions) || 0,
      releasedSessions: Number(row.released_sessions) || 0,
      expiredSessions: Number(row.expired_sessions) || 0,
      reservedTokens: Number(row.reserved_tokens) || 0,
      actualTokens: Number(row.actual_tokens) || 0,
      p50ActualTokens: Number(row.p50_actual_tokens) || 0,
      p90ActualTokens: Number(row.p90_actual_tokens) || 0,
    },
  };
}

export default reserveLlmBudget;
