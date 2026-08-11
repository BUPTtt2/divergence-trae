import test from 'node:test';
import assert from 'node:assert/strict';

import { pollDelay, resolveDeliberationTransport } from './deliberationTransport.js';

test('production uses bounded HTTP polling instead of a long-lived SSE connection', () => {
  assert.equal(resolveDeliberationTransport({ production: true }), 'poll');
});

test('development keeps SSE for local debugging', () => {
  assert.equal(resolveDeliberationTransport({ production: false }), 'sse');
});

test('poll delay stays responsive and backs off after failures', () => {
  assert.equal(pollDelay({ idle: false, failures: 0 }), 1500);
  assert.equal(pollDelay({ idle: true, idleCount: 1, failures: 0 }), 3500);
  assert.equal(pollDelay({ idle: true, idleCount: 8, failures: 0 }), 12000);
  assert.equal(pollDelay({ idle: true, idleCount: 8, failures: 0, hidden: true }), 20000);
  assert.equal(pollDelay({ idle: true, failures: 3 }), 12000);
});
