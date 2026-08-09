import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSandboxRuntime,
  mapDeliberationPhase,
  mapServerStateToInternalPhase,
  mapSessionToInternalPhase,
  selectedAdvisorIdsForSession,
  adaptFateTicket,
} from './sandboxRuntime.js';
import * as sandboxRuntime from './sandboxRuntime.js';

test('sandbox defaults to the Agent runtime and only explicit legacy rolls back', () => {
  assert.equal(resolveSandboxRuntime(undefined), 'agent');
  assert.equal(resolveSandboxRuntime('agent'), 'agent');
  assert.equal(resolveSandboxRuntime('legacy'), 'legacy');
  assert.equal(resolveSandboxRuntime('LOCAL_FULL'), 'agent');
});

test('server business states map to presentation phases without inventing completion', () => {
  assert.equal(mapDeliberationPhase('PLAN'), 'yan_analyze');
  assert.equal(mapDeliberationPhase('WAIT'), 'clarify_loop');
  assert.equal(mapDeliberationPhase('DELIBERATE'), 'agent_debate');
  assert.equal(mapDeliberationPhase('REFLECT'), 'summary');
  assert.equal(mapDeliberationPhase('ORACLE'), 'summary');
  assert.equal(mapDeliberationPhase('COMMIT'), 'committing');
  assert.equal(mapDeliberationPhase('COMPLETE'), 'final');
  assert.equal(mapDeliberationPhase('FAILED'), 'input');
});

test('commit event cannot reset the Agent flow to idle before completion', () => {
  assert.equal(mapServerStateToInternalPhase('ORACLE'), 'choice');
  assert.equal(mapServerStateToInternalPhase('COMMIT'), 'committing');
  assert.equal(mapServerStateToInternalPhase('COMPLETE'), 'done');
  assert.equal(mapServerStateToInternalPhase('ROUND_REVIEW'), 'debate');
  assert.equal(mapServerStateToInternalPhase('DELIBERATION_BLOCKED'), 'debate');
});

test('a confirmed case pauses at council selection until the user confirms the lineup', () => {
  assert.equal(mapSessionToInternalPhase({
    state: 'EXECUTE',
    plan: { councilStatus: 'draft', caseFile: { confirmedByUser: true } },
  }), 'council');
  assert.equal(mapSessionToInternalPhase({
    state: 'EXECUTE',
    plan: { councilStatus: 'confirmed', caseFile: { confirmedByUser: true } },
  }), 'debate');
});

test('restored sessions preserve the council lineup confirmed by the user', () => {
  assert.deepEqual(selectedAdvisorIdsForSession({
    plan: {
      councilStatus: 'confirmed',
      selectedAgentIds: ['health'],
      agents: [{ id: 'health' }, { id: 'risk' }],
    },
  }), ['health']);
  assert.deepEqual(selectedAdvisorIdsForSession({
    plan: { councilStatus: 'draft', agents: [{ id: 'health' }, { id: 'risk' }] },
  }), []);
});

test('authoritative fate ticket is adapted to the existing view contract', () => {
  const adapted = adaptFateTicket({
    ticketId: 'ft_1',
    oracleText: '先试后定。',
    keyFindings: [{ agentName: '镜渊', excerpt: '两周后用结果复盘' }],
  });

  assert.equal(adapted.source, 'deliberation_session');
  assert.equal(adapted.verse, '先试后定。');
  assert.deepEqual(adapted.keyPoints, ['两周后用结果复盘']);
  assert.deepEqual(adapted.agentSnippets, [{ name: '镜渊', snippet: '两周后用结果复盘' }]);
});

test('clarification UI renders the current pending Agent question before answered history', () => {
  assert.equal(typeof sandboxRuntime.currentClarificationQuestion, 'function');
  assert.equal(
    sandboxRuntime.currentClarificationQuestion(
      [{ question: '现有留存、预算和停止指标分别是什么？' }],
      [{ question: '旧问题', userAnswer: '旧答案' }],
    ),
    '现有留存、预算和停止指标分别是什么？',
  );
});

test('clarification UI keeps every pending Agent question visible in order', () => {
  assert.equal(typeof sandboxRuntime.normalizePendingClarifications, 'function');
  assert.deepEqual(
    sandboxRuntime.normalizePendingClarifications([
      { question: '你的目标是什么？', reason: '确定成功标准' },
      { question: '现在的生活节奏如何？', reason: '判断方案可行性' },
      { question: '   ' },
    ]),
    [
      { question: '你的目标是什么？', reason: '确定成功标准', fieldId: 'question_1', required: true },
      { question: '现在的生活节奏如何？', reason: '判断方案可行性', fieldId: 'question_2', required: true },
    ],
  );
});

test('pending clarification keeps the central interaction dock visible even if transport state lags', () => {
  assert.equal(typeof sandboxRuntime.shouldShowInteractionDock, 'function');
  assert.equal(sandboxRuntime.shouldShowInteractionDock({
    phase: 'clarify_loop',
    awaitingUser: false,
    awaitingAnswers: [{ question: '你现在有明显饥饿感吗？' }],
  }), true);
  assert.equal(sandboxRuntime.shouldShowInteractionDock({
    phase: 'clarify_loop',
    awaitingUser: false,
    awaitingAnswers: [],
  }), false);
});

test('clarification submission exposes a stable processing state until the Agent responds', () => {
  assert.equal(typeof sandboxRuntime.clarificationInteractionState, 'function');
  assert.deepEqual(sandboxRuntime.clarificationInteractionState(true), {
    heading: '正在消化你的回答',
    submitLabel: '正在整理案卷…',
    disabled: true,
  });
  assert.deepEqual(sandboxRuntime.clarificationInteractionState(false), {
    heading: '先补齐关键事实',
    submitLabel: '回答并继续',
    disabled: false,
  });
});

test('a restored PLAN session resumes its interrupted planning request', () => {
  assert.equal(typeof sandboxRuntime.shouldResumePlanning, 'function');
  assert.equal(sandboxRuntime.shouldResumePlanning('PLAN'), true);
  assert.equal(sandboxRuntime.shouldResumePlanning('READY'), false);
  assert.equal(sandboxRuntime.shouldResumePlanning('COMPLETE'), false);
});

test('planning starts from the pending Session and never waits for the SSE transport', () => {
  assert.equal(typeof sandboxRuntime.shouldRequestPlanning, 'function');
  assert.equal(sandboxRuntime.shouldRequestPlanning({
    pendingSessionId: 'sess_1',
    activeSessionId: 'sess_1',
    inFlightSessionId: null,
    transportConnected: false,
  }), true);
  assert.equal(sandboxRuntime.shouldRequestPlanning({
    pendingSessionId: 'sess_1',
    activeSessionId: 'sess_1',
    inFlightSessionId: 'sess_1',
    transportConnected: false,
  }), false);
});
