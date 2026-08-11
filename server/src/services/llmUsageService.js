import crypto from 'node:crypto';
import { query } from './db.js';

const clean = (value, max = 120) => String(value || '').trim().slice(0, max);
const number = (value) => Math.max(0, Number(value) || 0);

function normalizeUsage(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    prompt_tokens: number(value.prompt_tokens ?? value.input_tokens),
    completion_tokens: number(value.completion_tokens ?? value.output_tokens),
    total_tokens: number(value.total_tokens)
      || number(value.prompt_tokens ?? value.input_tokens) + number(value.completion_tokens ?? value.output_tokens),
  };
}

export function normalizeUsageEntry(input = {}) {
  return {
    id: clean(input.id, 160) || `usage_${crypto.randomUUID()}`,
    timestamp: input.timestamp || new Date().toISOString(),
    provider: clean(input.provider, 60) || 'unknown',
    model: clean(input.model, 120) || 'unknown',
    status: input.status === 'failed' ? 'failed' : 'success',
    sessionId: clean(input.sessionId, 160) || null,
    userId: clean(input.userId, 160) || null,
    agentId: clean(input.agentId, 120) || null,
    stage: clean(input.stage || input.actionId, 120) || 'llm',
    attempt: Math.max(1, Number(input.attempt) || 1),
    latencyMs: number(input.latencyMs),
    usage: normalizeUsage(input.usage),
    usageMissing: input.status !== 'failed' && !normalizeUsage(input.usage),
    estimatedCostCny: input.estimatedCostCny == null ? null : number(input.estimatedCostCny),
    error: input.error ? {
      status: number(input.error.status),
      code: clean(input.error.code, 80) || 'provider_error',
      retryAfterMs: number(input.error.retryAfterMs),
    } : null,
  };
}

function emptyGroup() {
  return { calls: 0, successfulCalls: 0, failedCalls: 0, usageMissingCalls: 0, costMissingCalls: 0, tokens: { input: 0, output: 0, total: 0 }, estimatedCostCny: 0 };
}

function addToGroup(group, entry) {
  group.calls += 1;
  if (entry.status === 'success') group.successfulCalls += 1;
  else group.failedCalls += 1;
  if (entry.usageMissing) group.usageMissingCalls += 1;
  if (entry.status === 'success' && entry.usage && entry.estimatedCostCny == null) group.costMissingCalls += 1;
  group.tokens.input += number(entry.usage?.prompt_tokens);
  group.tokens.output += number(entry.usage?.completion_tokens);
  group.tokens.total += number(entry.usage?.total_tokens);
  group.estimatedCostCny = Number((group.estimatedCostCny + number(entry.estimatedCostCny)).toFixed(8));
}

export function summarizeUsageEntries(entries = []) {
  const normalized = entries.map(normalizeUsageEntry);
  const summary = {
    ...emptyGroup(),
    retryCalls: 0,
    averageLatencyMs: 0,
    byProvider: {},
    byStage: {},
  };
  let latencyTotal = 0;
  for (const entry of normalized) {
    addToGroup(summary, entry);
    if (entry.attempt > 1) summary.retryCalls += 1;
    latencyTotal += entry.latencyMs;
    summary.byProvider[entry.provider] ||= emptyGroup();
    summary.byStage[entry.stage] ||= emptyGroup();
    addToGroup(summary.byProvider[entry.provider], entry);
    addToGroup(summary.byStage[entry.stage], entry);
  }
  summary.averageLatencyMs = normalized.length ? Math.round(latencyTotal / normalized.length) : 0;
  return summary;
}

export async function persistUsageEntry(input = {}) {
  const entry = normalizeUsageEntry(input);
  await query({
    table: 'llm_usage_events',
    action: 'insert',
    data: {
      id: entry.id,
      session_id: entry.sessionId,
      user_id: entry.userId,
      provider: entry.provider,
      model: entry.model,
      stage: entry.stage,
      agent_id: entry.agentId,
      status: entry.status,
      attempt: entry.attempt,
      prompt_tokens: entry.usage?.prompt_tokens || 0,
      completion_tokens: entry.usage?.completion_tokens || 0,
      total_tokens: entry.usage?.total_tokens || 0,
      usage_missing: entry.usageMissing,
      latency_ms: entry.latencyMs,
      estimated_cost_cny: entry.estimatedCostCny,
      error_status: entry.error?.status || 0,
      error_code: entry.error?.code || null,
      created_at: entry.timestamp,
    },
  });
  return entry;
}

function rowToEntry(row = {}) {
  return normalizeUsageEntry({
    id: row.id,
    timestamp: row.created_at,
    provider: row.provider,
    model: row.model,
    stage: row.stage,
    agentId: row.agent_id,
    status: row.status,
    attempt: row.attempt,
    latencyMs: row.latency_ms,
    estimatedCostCny: row.estimated_cost_cny,
    usage: row.usage_missing ? null : {
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      total_tokens: row.total_tokens,
    },
    error: row.error_code ? { status: row.error_status, code: row.error_code } : null,
  });
}

export async function getSessionUsage(sessionId) {
  const result = await query({
    table: 'llm_usage_events',
    action: 'select',
    filter: { session_id: sessionId },
    queryOptions: { orderBy: 'created_at:asc', limit: 200 },
  });
  const entries = result.rows.map(rowToEntry);
  return { sessionId, summary: summarizeUsageEntries(entries), entries };
}

export default { normalizeUsageEntry, summarizeUsageEntries, persistUsageEntry, getSessionUsage };
