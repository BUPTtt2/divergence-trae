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
