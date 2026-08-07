import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExecuteRequest,
  normalizeExecuteResponse,
  parseExecuteRequest,
} from '../../shared/deliberationContract.js';

test('execute request keeps stable actionId and selected agentIds', () => {
  const request = createExecuteRequest({ actionId: 'act_001', agentIds: ['qiangu', 'fengyan'] });
  assert.deepEqual(request, { actionId: 'act_001', agentIds: ['qiangu', 'fengyan'] });
  assert.deepEqual(parseExecuteRequest(request), request);
});

test('execute request rejects the obsolete context-only payload', () => {
  assert.throws(() => parseExecuteRequest({ context: { round: 1 } }), /actionId/);
});

test('execute response always exposes one stable shape', () => {
  const response = normalizeExecuteResponse({
    sessionId: 'sess_001',
    state: 'ORACLE',
    findings: [],
    dynamicChoices: [],
    masterSummary: '',
  });

  assert.deepEqual(Object.keys(response).sort(), [
    'conflicts', 'dynamicChoices', 'fallback', 'findings', 'gaps', 'masterSummary',
    'oracle', 'reason', 'replanned', 'sessionId', 'state',
  ].sort());
});
