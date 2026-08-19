import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRuntimeStatus, initialRuntimeStatus } from './runtimeStatus.js';

test('runtime status starts in checking state', () => {
  assert.deepEqual(initialRuntimeStatus(), {
    kind: 'checking',
    service: 'checking',
    execution: 'idle',
    provenance: 'unknown',
    latencyMs: null,
    checkedAt: 0,
    failures: 0,
    reason: '',
  });
});

test('successful health probe proves only service reachability', () => {
  const state = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'probe:ok', latencyMs: 86, at: 1000 });
  assert.equal(state.kind, 'online');
  assert.equal(state.service, 'reachable');
  assert.equal(state.execution, 'idle');
  assert.equal(state.provenance, 'unknown');
  assert.equal(state.latencyMs, 86);
});

test('request lifecycle cannot turn a reachable service into a model claim', () => {
  const reachable = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'probe:ok', latencyMs: 40, at: 1 });
  const running = deriveRuntimeStatus(reachable, { type: 'request:start', at: 2 });
  const completed = deriveRuntimeStatus(running, { type: 'request:ok', at: 3 });

  assert.equal(running.service, 'reachable');
  assert.equal(running.execution, 'running');
  assert.equal(completed.execution, 'idle');
  assert.equal(completed.provenance, 'unknown');
  const state = completed;
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
  const recovered = deriveRuntimeStatus(stalled, { type: 'work:progress', provenance: 'model', latencyMs: 1280, at: 30 });

  assert.equal(stalled.service, 'reachable');
  assert.equal(stalled.execution, 'failed');
  assert.equal(stalled.reason, '推演等待智囊响应超时');
  assert.equal(recovered.kind, 'online');
  assert.equal(recovered.execution, 'model');
  assert.equal(recovered.provenance, 'model');
  assert.equal(recovered.failures, 0);
});

test('fallback work stays reachable while exposing fallback provenance', () => {
  const reachable = deriveRuntimeStatus(initialRuntimeStatus(), { type: 'probe:ok', at: 10 });
  const fallback = deriveRuntimeStatus(reachable, { type: 'work:progress', provenance: 'safety-fallback', at: 20 });

  assert.equal(fallback.kind, 'online');
  assert.equal(fallback.service, 'reachable');
  assert.equal(fallback.execution, 'fallback');
  assert.equal(fallback.provenance, 'safety-fallback');
});
