import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntime } from '../src/services/providerRuntime.js';

test('two rate limits open a provider circuit until cooldown expires', () => {
  let now = 1000;
  const runtime = createProviderRuntime({ failureThreshold: 2, cooldownMs: 5000, clock: () => now });

  runtime.recordFailure('zhipu', { status: 429 });
  assert.equal(runtime.canAttempt('zhipu'), true);
  runtime.recordFailure('zhipu', { status: 429 });
  assert.equal(runtime.canAttempt('zhipu'), false);
  now = 6001;
  assert.equal(runtime.canAttempt('zhipu'), true);
});

test('successful calls close a half-open circuit and preserve usage entries', () => {
  let now = 1000;
  const runtime = createProviderRuntime({ failureThreshold: 1, cooldownMs: 100, clock: () => now });
  runtime.recordFailure('zhipu', { status: 429 });
  now = 1200;
  runtime.recordSuccess('zhipu', {
    model: 'glm-4-flash-250414', latencyMs: 280,
    usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12 },
  });

  assert.equal(runtime.canAttempt('zhipu'), true);
  assert.equal(runtime.entries().at(-1).usage.total_tokens, 12);
  assert.equal(runtime.entries().at(-1).status, 'success');
  assert.equal(runtime.entries().at(-1).estimatedCostCny, 0);
});

test('usage ledger estimates paid fallback cost without exposing credentials', () => {
  const runtime = createProviderRuntime({ clock: () => 1000 });
  runtime.recordSuccess('deepseek', {
    model: 'deepseek-v4-flash',
    usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
  });

  const entry = runtime.entries().at(-1);
  assert.equal(entry.estimatedCostCny, 0.002);
  assert.equal(JSON.stringify(entry).includes('apiKey'), false);
});

test('usage ledger recognizes the Ark model name returned by Doubao 1.5', () => {
  const runtime = createProviderRuntime({ clock: () => 1000 });
  runtime.recordSuccess('doubao', {
    model: 'doubao-1-5-pro-32k-250115',
    usage: { prompt_tokens: 4000, completion_tokens: 1000, total_tokens: 5000 },
  });

  assert.equal(runtime.entries().at(-1).estimatedCostCny, 0.0052);
});

test('usage ledger recognizes current Doubao Seed 2.1 text prices', () => {
  const runtime = createProviderRuntime({ clock: () => 1000 });
  runtime.recordSuccess('doubao', {
    model: 'doubao-seed-2-1-pro-250615',
    usage: { prompt_tokens: 60_000, completion_tokens: 20_000, total_tokens: 80_000 },
  });

  assert.equal(runtime.entries().at(-1).estimatedCostCny, 0.96);
});

test('provider runtime forwards sanitized entries to a durable sink without blocking calls', async () => {
  const saved = [];
  const runtime = createProviderRuntime({ clock: () => 1000 });
  runtime.setSink(async (entry) => { saved.push(entry); });
  runtime.recordSuccess('zhipu', {
    model: 'glm-4-flash-250414',
    sessionId: 'sess-1',
    stage: 'planner',
    usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(saved.length, 1);
  assert.equal(saved[0].sessionId, 'sess-1');
  assert.equal(saved[0].stage, 'planner');
  assert.equal(saved[0].usage.total_tokens, 6);
});
