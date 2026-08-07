import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingActionRegistry } from './deliberationActions.js';

test('a pending execute retry reuses its actionId until completion', () => {
  let sequence = 0;
  const actions = createPendingActionRegistry(() => `uuid-${++sequence}`);

  const first = actions.get('sess_001', 'execute-r1');
  const retry = actions.get('sess_001', 'execute-r1');
  assert.equal(first, 'sess_001:execute-r1:uuid-1');
  assert.equal(retry, first);

  actions.complete('sess_001', 'execute-r1');
  assert.equal(actions.get('sess_001', 'execute-r1'), 'sess_001:execute-r1:uuid-2');
});

test('different sessions and rounds never share an actionId', () => {
  let sequence = 0;
  const actions = createPendingActionRegistry(() => `uuid-${++sequence}`);

  const values = new Set([
    actions.get('sess_001', 'execute-r1'),
    actions.get('sess_001', 'execute-r2'),
    actions.get('sess_002', 'execute-r1'),
  ]);

  assert.equal(values.size, 3);
});
