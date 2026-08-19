import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateTokenReservation,
  recordLlmUsage,
  releaseLlmSessionBudget,
  reserveLlmBudget,
  settleLlmSessionBudget,
} from '../src/services/llmBudgetService.js';

const productionEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://configured',
  RATE_LIMIT_HASH_SECRET: 'rate-secret',
  LLM_SESSION_TOKEN_ENVELOPE: '250000',
  LLM_USER_DAILY_SESSION_LIMIT: '3',
  LLM_GLOBAL_DAILY_SESSION_LIMIT: '100',
  LLM_MAX_ACTIVE_SESSIONS: '20',
  LLM_USER_MAX_ACTIVE_SESSIONS: '1',
  LLM_SESSION_EMERGENCY_TOKEN_LIMIT: '1000000',
};

test('token reservation conservatively counts non-ascii text, ascii text, message overhead and output ceiling', () => {
  assert.equal(estimateTokenReservation([{ role: 'user', content: 'abcd' }], 100), 117);
  assert.equal(estimateTokenReservation([{ role: 'user', content: '演策推演' }], 100), 120);
});

test('one deliberation reserves a whole-session envelope instead of charging every model call', async () => {
  const calls = [];
  const queryImpl = async (request) => {
    calls.push(request);
    return { rows: [{
      reservation: { session_id: 'session-1', user_id: 'user-1', status: 'active', reserved_tokens: 250000, actual_tokens: 0 },
      decision: 'created', user_daily_sessions: 0, global_daily_sessions: 0, active_sessions: 0, user_active_sessions: 0,
    }] };
  };

  const first = await reserveLlmBudget({ sessionId: 'session-1', userId: 'user-1' }, { env: productionEnv, queryImpl });
  const second = await reserveLlmBudget({ sessionId: 'session-1', userId: 'user-1' }, { env: productionEnv, queryImpl });

  assert.equal(first.reservedTokens, 250000);
  assert.equal(second.reservedTokens, 250000);
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.match(calls[0].sql, /ON CONFLICT \(session_id\) DO NOTHING/);
  assert.deepEqual(calls[0].params.slice(0, 7), ['session-1', 'user-1', 250000, 3, 100, 20, 1]);
});

test('new sessions are rejected at active capacity while an admitted session remains usable', async () => {
  const existing = await reserveLlmBudget({ sessionId: 'session-live', userId: 'user-1' }, {
    env: productionEnv,
    queryImpl: async () => ({ rows: [{
      reservation: { session_id: 'session-live', user_id: 'user-1', status: 'active', reserved_tokens: 250000 },
      decision: 'existing', active_sessions: 20,
    }] }),
  });
  assert.equal(existing.enabled, true);
  assert.equal(existing.decision, 'existing');

  await assert.rejects(
    () => reserveLlmBudget({ sessionId: 'session-new', userId: 'user-2' }, {
      env: productionEnv,
      queryImpl: async () => ({ rows: [{ reservation: null, decision: 'global_active_limit', active_sessions: 20 }] }),
    }),
    (error) => error.code === 'LLM_CAPACITY_BUSY' && error.retryable === true,
  );
});

test('daily session capacity is distinct from transient concurrency pressure', async () => {
  await assert.rejects(
    () => reserveLlmBudget({ sessionId: 'session-4', userId: 'user-1' }, {
      env: productionEnv,
      queryImpl: async () => ({ rows: [{ reservation: null, decision: 'user_daily_limit', user_daily_sessions: 3 }] }),
    }),
    (error) => error.code === 'LLM_DAILY_SESSIONS_EXCEEDED' && error.retryable === false,
  );
});

test('an admitted session is stopped only at an emergency runaway ceiling, not its planning envelope', async () => {
  const makeQuery = (actualTokens) => async () => ({ rows: [{
    reservation: {
      session_id: 'session-live', user_id: 'user-1', status: 'active',
      reserved_tokens: 250000, actual_tokens: actualTokens,
    },
    decision: 'existing',
  }] });

  assert.equal((await reserveLlmBudget({ sessionId: 'session-live', userId: 'user-1' }, {
    env: productionEnv, queryImpl: makeQuery(400000),
  })).enabled, true);
  await assert.rejects(
    () => reserveLlmBudget({ sessionId: 'session-live', userId: 'user-1' }, {
      env: productionEnv, queryImpl: makeQuery(1000000),
    }),
    (error) => error.code === 'LLM_SESSION_SAFETY_STOP' && error.retryable === false,
  );
});

test('release and settlement are idempotent state transitions and usage is accumulated', async () => {
  const calls = [];
  const queryImpl = async (request) => {
    calls.push(request);
    if (/actual_tokens = actual_tokens/.test(request.sql)) return { rows: [{ session_id: 'session-1', actual_tokens: 130000 }], rowCount: 1 };
    if (/status = 'released'/.test(request.sql)) return { rows: [{ session_id: 'session-1', status: 'released' }], rowCount: 1 };
    if (/status = 'settled'/.test(request.sql)) return { rows: [{ session_id: 'session-2', status: 'settled' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  assert.equal((await recordLlmUsage('session-1', 130000, { queryImpl })).actualTokens, 130000);
  assert.equal((await releaseLlmSessionBudget('session-1', 'terminal_failure', { queryImpl })).released, true);
  assert.equal((await settleLlmSessionBudget('session-2', { queryImpl })).settled, true);
  assert.match(calls[1].sql, /WHERE session_id = \$1 AND status = 'active'/);
  assert.match(calls[2].sql, /WHERE session_id = \$1 AND status = 'active'/);
});

test('entry routing without a session keeps a small distributed request budget', async () => {
  const calls = [];
  const result = await reserveLlmBudget({ messages: [{ role: 'user', content: 'abcd' }], maxTokens: 100, userId: 'user-1' }, {
    env: { ...productionEnv, LLM_ENTRY_DAILY_TOKEN_BUDGET: '1000' },
    consumeImpl: async (input) => {
      calls.push(input);
      return { allowed: true, remaining: input.limit - input.cost, resetAt: '2026-08-20T00:00:00.000Z' };
    },
  });
  assert.equal(result.reservedTokens, 117);
  assert.deepEqual(calls.map(({ scope, cost, limit }) => ({ scope, cost, limit })), [
    { scope: 'llm_entry_token_day', cost: 117, limit: 1000 },
  ]);
});

test('production refuses missing capacity storage and development can run locally', async () => {
  await assert.rejects(
    () => reserveLlmBudget({ sessionId: 'session-1', userId: 'user-1' }, { env: { NODE_ENV: 'production' } }),
    (error) => error.code === 'LLM_BUDGET_UNAVAILABLE',
  );

  assert.deepEqual(
    await reserveLlmBudget({ sessionId: 'session-1' }, { env: { NODE_ENV: 'development' } }),
    { enabled: false, reservedTokens: 0, reason: 'distributed_budget_unavailable' },
  );
});
