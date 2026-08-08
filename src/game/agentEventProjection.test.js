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

test('Lens lifecycle events project source, task status, impact and review with distinct motion cues', () => {
  let state = createArenaProjection();
  assert.deepEqual(state.lens, { selected: null, tasks: {}, impacts: {}, review: null });

  state = applyAgentEvent(state, event(1, 'LENS_SELECTED', {
    lensId: 24,
    lensName: '复',
    source: 'session-derived',
    sourceDigest: 'a'.repeat(64),
    invariants: {
      evidenceLocked: true,
      riskLocked: true,
      approvalLocked: true,
      userDecisionLocked: true,
    },
  }));
  assert.equal(state.lens.selected.lensName, '复');
  assert.equal(state.lens.selected.source, 'session-derived');
  assert.equal(state.motionCue.kind, 'lens-select');

  state = applyAgentEvent(state, event(2, 'LENS_TASK_CREATED', {
    taskId: 'lens-task-1',
    lensId: 24,
    kind: 'counterfactual',
    question: '若关键假设反转，当前证据是否仍成立？',
    targetPerspective: 'risk',
    causedBy: ['ref_conflict'],
  }));
  assert.equal(state.lens.tasks['lens-task-1'].status, 'pending');
  assert.equal(state.lens.tasks['lens-task-1'].question, '若关键假设反转，当前证据是否仍成立？');
  assert.equal(state.motionCue.kind, 'lens-task');

  state = applyAgentEvent(state, event(3, 'LENS_TASK_COMPLETED', {
    taskId: 'lens-task-1',
    lensId: 24,
    outcome: 'evidence-added',
    findingIds: ['finding-1'],
    summary: '补充了一条可追溯证据。',
  }));
  assert.equal(state.lens.tasks['lens-task-1'].status, 'completed');
  assert.equal(state.lens.impacts['lens-task-1'].summary, '补充了一条可追溯证据。');
  assert.equal(state.motionCue.kind, 'lens-impact');

  state = applyAgentEvent(state, event(4, 'LENS_REVIEW_COMPLETED', {
    lensId: 24,
    taskCount: 1,
    impactCount: 1,
    changedTaskCount: 1,
    summary: '已完成 1 项审查任务，其中 1 项产生可追溯影响。',
  }));
  assert.equal(state.lens.review.summary, '已完成 1 项审查任务，其中 1 项产生可追溯影响。');
  assert.equal(state.motionCue.kind, 'lens-review');
});

test('Lens duplicate, older and replayed events never retrigger motion', () => {
  const selected = applyAgentEvent(createArenaProjection(), event(4, 'LENS_SELECTED', {
    lensId: 24,
    lensName: '复',
    source: 'session-derived',
  }));
  const duplicate = applyAgentEvent(selected, event(4, 'LENS_SELECTED', {
    lensId: 24,
    lensName: '复',
  }, { eventId: 'evt_duplicate_lens' }));
  const older = applyAgentEvent(selected, event(3, 'LENS_TASK_CREATED', {
    taskId: 'lens-task-old',
    question: '过期问题',
  }));
  const replayed = applyAgentEvent(createArenaProjection(), event(1, 'LENS_TASK_CREATED', {
    taskId: 'lens-task-replay',
    lensId: 24,
    question: '历史审查问题',
    causedBy: ['ref_history'],
  }), { replay: true });

  assert.equal(selected.motionCue.kind, 'lens-select');
  assert.equal(duplicate, selected);
  assert.equal(older, selected);
  assert.equal(replayed.lens.tasks['lens-task-replay'].question, '历史审查问题');
  assert.equal(replayed.motionCue, null);
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

test('session snapshot restores Lens projection without replaying its ceremony', () => {
  const state = projectSessionSnapshot({
    state: 'ORACLE',
    cognitivePlan: {
      lensId: 24,
      lensName: '复',
      source: 'session-derived',
      sourceDigest: 'b'.repeat(64),
      invariants: {
        evidenceLocked: true,
        riskLocked: true,
        approvalLocked: true,
        userDecisionLocked: true,
      },
      reviewTasks: [{
        id: 'lens-task-snapshot',
        kind: 'exit-condition',
        question: '什么条件出现时应停止试行？',
        targetPerspective: 'risk',
        causedBy: ['ref_snapshot'],
        prompt: '不得进入前端投影',
      }],
      rawModelContent: '不得进入前端投影',
    },
    lensImpacts: [{
      taskId: 'lens-task-snapshot',
      lensId: 24,
      outcome: 'exit-condition-added',
      findingIds: ['finding-exit'],
      summary: '增加了可验证的退出条件。',
      rawModelContent: '不得进入前端投影',
    }],
  }, { lastSequence: 18 });

  assert.deepEqual(state.lens.selected, {
    lensId: 24,
    lensName: '复',
    source: 'session-derived',
    sourceDigest: 'b'.repeat(64),
    invariants: {
      evidenceLocked: true,
      riskLocked: true,
      approvalLocked: true,
      userDecisionLocked: true,
    },
  });
  assert.equal(state.lens.tasks['lens-task-snapshot'].status, 'completed');
  assert.equal(state.lens.impacts['lens-task-snapshot'].outcome, 'exit-condition-added');
  assert.deepEqual(state.lens.review, {
    lensId: 24,
    taskCount: 1,
    impactCount: 1,
    changedTaskCount: 1,
    summary: '已完成 1 项审查任务，其中 1 项产生可追溯影响。',
    restored: true,
  });
  assert.doesNotMatch(JSON.stringify(state.lens), /rawModelContent|prompt|不得进入前端投影/);
  assert.equal(state.motionCue, null);
});
