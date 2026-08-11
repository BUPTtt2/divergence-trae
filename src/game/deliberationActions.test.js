import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingActionRegistry, deliberationActionKey } from './deliberationActions.js';

test('summary confirmation uses a different idempotency key than round execution', () => {
  assert.equal(deliberationActionKey(2), 'execute-r2');
  assert.equal(deliberationActionKey(2, 'summary'), 'summary-r2');
});

test('registry reuses pending id only within one action kind', () => {
  let i = 0;
  const registry = createPendingActionRegistry(() => `id-${++i}`);
  assert.equal(registry.get('s', 'execute-r1'), registry.get('s', 'execute-r1'));
  assert.notEqual(registry.get('s', 'execute-r1'), registry.get('s', 'summary-r1'));
});
