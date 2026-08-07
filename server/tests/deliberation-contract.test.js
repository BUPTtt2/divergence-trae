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
    cognitivePlan: { lensId: 1, reviewTasks: [] },
    lensImpacts: [{ taskId: 'lens-task-1', outcome: 'no-change' }],
  });

  assert.deepEqual(Object.keys(response).sort(), [
    'askUser', 'clarifyRequired', 'cognitivePlan', 'conflicts', 'dynamicChoices', 'fallback', 'findings',
    'gaps', 'masterSummary', 'oracle', 'reason', 'replanned', 'sessionId', 'state',
    'lensImpacts',
  ].sort());
  assert.equal(response.cognitivePlan.lensId, 1);
  assert.equal(response.lensImpacts[0].taskId, 'lens-task-1');
});

test('execute response preserves a server-requested clarification', () => {
  const askUser = [{ question: '你的时间边界是什么？', reason: '约束决策范围' }];
  const response = normalizeExecuteResponse({
    sessionId: 'sess_clarify',
    state: 'CLARIFY',
    clarifyRequired: true,
    askUser,
  });

  assert.equal(response.clarifyRequired, true);
  assert.deepEqual(response.askUser, askUser);
});
