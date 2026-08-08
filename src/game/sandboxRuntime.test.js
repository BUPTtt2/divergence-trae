import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSandboxRuntime,
  mapDeliberationPhase,
  mapServerStateToInternalPhase,
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
