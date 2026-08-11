import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRuntimeStatus, initialRuntimeStatus } from './runtimeStatus.js';

test('runtime status starts in checking state', () => {
  assert.equal(initialRuntimeStatus().kind, 'checking');
});

test('successful probe produces online state with latency', () => {
  const state = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'probe:ok', latencyMs: 86, at: 1000 });
  assert.deepEqual(state, { kind: 'online', latencyMs: 86, checkedAt: 1000, failures: 0 });
});

test('request start is yellow while preserving previous latency', () => {
  const state = deriveRuntimeStatus({ kind: 'online', latencyMs: 40, checkedAt: 1, failures: 0 }, { type: 'request:start', at: 2 });
  assert.equal(state.kind, 'checking');
  assert.equal(state.latencyMs, 40);
});

test('first network failure is degraded and repeated failure is offline', () => {
  const once = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'request:error', at: 10 });
  const twice = deriveRuntimeStatus(once, { type: 'probe:error', at: 20 });
  assert.equal(once.kind, 'degraded');
  assert.equal(twice.kind, 'offline');
  assert.equal(twice.failures, 2);
});

test('an execution with no progress becomes degraded even while health probes pass', () => {
  const online = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'probe:ok', latencyMs: 42, at: 10 });
  const stalled = deriveRuntimeStatus(online, { type: 'work:stalled', at: 20 });
  const recovered = deriveRuntimeStatus(stalled, { type: 'work:progress', latencyMs: 1280, at: 30 });

  assert.equal(stalled.kind, 'degraded');
  assert.equal(stalled.reason, '推演等待智囊响应超时');
  assert.equal(recovered.kind, 'online');
  assert.equal(recovered.failures, 0);
});
