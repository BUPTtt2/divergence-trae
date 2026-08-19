import test from 'node:test';
import assert from 'node:assert/strict';

const usageService = await import('../src/services/llmUsageService.js').catch(() => null);

test('usage entry keeps billing metadata and removes prompts, keys, and response bodies', () => {
  assert.ok(usageService, 'llmUsageService module must exist');
  const entry = usageService.normalizeUsageEntry({
    timestamp: '2026-08-11T00:00:00.000Z',
    provider: 'doubao',
    model: 'doubao-1.5-pro-32k',
    status: 'success',
    sessionId: 'sess-1',
    userId: 'user-1',
    agentId: 'risk',
    stage: 'advisor',
    attempt: 2,
    latencyMs: 812,
    usage: { prompt_tokens: 3500, completion_tokens: 1500, total_tokens: 5000 },
    prompt: 'must not persist',
    apiKey: 'must not persist',
    content: 'must not persist',
  });

  assert.deepEqual(entry.usage, { prompt_tokens: 3500, completion_tokens: 1500, total_tokens: 5000 });
  assert.equal(entry.stage, 'advisor');
  assert.equal(entry.attempt, 2);
  assert.equal('prompt' in entry, false);
  assert.equal('apiKey' in entry, false);
  assert.equal('content' in entry, false);
});

test('session summary separates successful usage, failures, missing usage and retries', () => {
  assert.ok(usageService, 'llmUsageService module must exist');
  const summary = usageService.summarizeUsageEntries([
    { provider: 'doubao', model: 'm1', status: 'success', stage: 'planner', attempt: 1, latencyMs: 100, usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, estimatedCostCny: 0.001 },
    { provider: 'doubao', model: 'm1', status: 'success', stage: 'advisor', attempt: 2, latencyMs: 200, usage: { prompt_tokens: 300, completion_tokens: 80, total_tokens: 380 }, estimatedCostCny: 0.002 },
    { provider: 'zhipu', model: 'm2', status: 'failed', stage: 'advisor', attempt: 1, latencyMs: 300, error: { status: 429 } },
    { provider: 'zhipu', model: 'm2', status: 'success', stage: 'summary', attempt: 1, latencyMs: 400, usage: null },
  ]);

  assert.equal(summary.calls, 4);
  assert.equal(summary.successfulCalls, 3);
  assert.equal(summary.failedCalls, 1);
  assert.equal(summary.retryCalls, 1);
  assert.equal(summary.usageMissingCalls, 1);
  assert.deepEqual(summary.tokens, { input: 400, output: 100, total: 500 });
  assert.equal(summary.estimatedCostCny, 0.003);
  assert.equal(summary.byStage.advisor.tokens.total, 380);
  assert.equal(summary.byProvider.doubao.calls, 2);
});

test('session summary exposes calls whose token usage has no configured price', () => {
  const summary = usageService.summarizeUsageEntries([
    { provider: 'doubao', model: 'ep-unknown', status: 'success', stage: 'planner', usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }, estimatedCostCny: null },
  ]);

  assert.equal(summary.costMissingCalls, 1);
  assert.equal(summary.estimatedCostCny, 0);
});

test('ops usage summary returns aggregate billing evidence without prompts or response content', async () => {
  const result = await usageService.getOpsUsageSummary({
    from: '2026-08-18T00:00:00.000Z',
    to: '2026-08-19T00:00:00.000Z',
  }, {
    env: {
      LLM_SESSION_TOKEN_ENVELOPE: '250000', LLM_USER_DAILY_SESSION_LIMIT: '3',
      LLM_GLOBAL_DAILY_SESSION_LIMIT: '100', LLM_MAX_ACTIVE_SESSIONS: '20',
    },
    queryImpl: async ({ action, sql, params }) => {
      assert.equal(action, 'raw');
      assert.deepEqual(params, ['2026-08-18T00:00:00.000Z', '2026-08-19T00:00:00.000Z']);
      if (sql.includes('llm_capacity_reservations')) return { rows: [{
        reservations: 4, active_sessions: 1, settled_sessions: 2, released_sessions: 1,
        reserved_tokens: 1000000, actual_tokens: 390000, p50_actual_tokens: 130000, p90_actual_tokens: 150000,
      }] };
      return { rows: [{
        id: 'usage-1', provider: 'ark-primary', model: 'm1', stage: 'planner', status: 'success', attempt: 1,
        prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, usage_missing: false,
        latency_ms: 90, estimated_cost_cny: 0.003, created_at: '2026-08-18T10:00:00.000Z',
        prompt: 'must not appear', content: 'must not appear',
      }] };
    },
  });

  assert.equal(result.summary.tokens.total, 120);
  assert.deepEqual(result.capacity.limits, {
    sessionTokenEnvelope: 250000, userDailySessions: 3, globalDailySessions: 100,
    maxActiveSessions: 20, userMaxActiveSessions: 1, sessionEmergencyTokenLimit: 1000000,
  });
  assert.equal(result.capacity.observed.actualTokens, 390000);
  assert.equal(result.capacity.observed.p90ActualTokens, 150000);
  assert.equal(JSON.stringify(result).includes('must not appear'), false);
});
