import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAgentEvent,
  createArenaProjection,
  projectSessionSnapshot,
} from './agentEventProjection.js';

function event(sequence, type, payload = {}, extras = {}) {
  return {
    eventId: extras.eventId || `evt_${sequence}`,
    sessionId: 'sess_projection',
    sequence,
    type,
    actorId: extras.actorId || 'yan',
    correlationId: 'corr_projection',
    payload,
    visibility: 'public',
    createdAt: new Date(sequence * 1000).toISOString(),
    schemaVersion: 1,
    ...extras,
  };
}

test('projection ignores duplicate and older events without replaying motion', () => {
  const initial = createArenaProjection();
  const first = applyAgentEvent(initial, event(2, 'PLAN_CREATED', { tasks: [{ id: 'task_1', label: '核验成本' }] }));
  const duplicate = applyAgentEvent(first, event(2, 'PLAN_CREATED', {}, { eventId: 'evt_other' }));
  const old = applyAgentEvent(first, event(1, 'PLAN_REVISED', {}));

  assert.equal(first.lastSequence, 2);
  assert.equal(first.motionCue.kind, 'plan');
  assert.equal(duplicate, first);
  assert.equal(old, first);
});

test('projection creates task, evidence, conflict, revision, approval and completion semantics', () => {
  let state = createArenaProjection();
  state = applyAgentEvent(state, event(1, 'PLAN_CREATED', { tasks: [{ id: 'task_1', label: '核验成本' }] }));
  state = applyAgentEvent(state, event(2, 'AGENT_ASSIGNED', { agentId: 'risk', agentName: '风眼', taskId: 'task_1' }));
  state = applyAgentEvent(state, event(3, 'EVIDENCE_ACCEPTED', { evidenceId: 'ev_1', summary: '成本可控', level: 'E2', sourceName: '公开信息' }));
  state = applyAgentEvent(state, event(4, 'CLAIM_CHALLENGED', { claimId: 'claim_1', challengerId: 'risk', reason: '现金流假设偏乐观' }));
  state = applyAgentEvent(state, event(5, 'PLAN_REVISED', { reason: '新证据改变优先级', tasks: [{ id: 'task_2', label: '压力测试' }] }));
  state = applyAgentEvent(state, event(6, 'APPROVAL_REQUIRED', { prompt: '是否接受两周试行方案？' }));
  state = applyAgentEvent(state, event(7, 'SESSION_COMPLETED', { summary: '形成可逆试行路径' }));

  assert.equal(state.tasks.task_1.label, '核验成本');
  assert.equal(state.tasks.task_2.label, '压力测试');
  assert.equal(state.agents.risk.status, 'assigned');
  assert.equal(state.evidence.ev_1.level, 'E2');
  assert.equal(state.conflicts[0].reason, '现金流假设偏乐观');
  assert.equal(state.revisions[0].reason, '新证据改变优先级');
  assert.equal(state.approval.prompt, '是否接受两周试行方案？');
  assert.equal(state.status, 'completed');
  assert.equal(state.motionCue.kind, 'crystallize');
});

test('replayed events restore structure without entrance motion', () => {
  const state = applyAgentEvent(
    createArenaProjection(),
    event(4, 'EVIDENCE_ACCEPTED', { evidenceId: 'ev_replay', summary: '历史证据' }),
    { replay: true },
  );

  assert.equal(state.evidence.ev_replay.summary, '历史证据');
  assert.equal(state.motionCue, null);
});

test('session snapshot restores arena structure before consuming missing events', () => {
  const state = projectSessionSnapshot({
    state: 'ORACLE',
    plan: {
      dimensions: [{ id: 'cost', name: '成本' }],
      agents: [{ id: 'risk', name: '风眼' }],
    },
    toolResults: [{ evidence: { id: 'ev_snapshot', summary: '历史证据', accepted: true } }],
    findings: [{ id: 'claim_snapshot', agentId: 'risk', content: '建议先试行' }],
    conflicts: [{ reason: '存在冲突' }],
    dynamicChoices: [{ id: 'trial', label: '先试行' }],
    replanCount: 2,
    masterSummary: '已形成三个路径',
  }, { lastSequence: 12 });

  assert.equal(state.lastSequence, 12);
  assert.equal(state.tasks.cost.label, '成本');
  assert.equal(state.agents.risk.agentName, '风眼');
  assert.equal(state.evidence.ev_snapshot.summary, '历史证据');
  assert.equal(state.claims.claim_snapshot.content, '建议先试行');
  assert.equal(state.revisions.length, 2);
  assert.equal(state.approval.choices[0].id, 'trial');
  assert.equal(state.status, 'awaiting-approval');
  assert.equal(state.motionCue, null);
});
