import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDecisionCase, confirmDecisionCase } from '../src/services/decisionCaseService.js';

test('decision case keeps every user answer as a confirmed fact instead of overwriting earlier rounds', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要辞职',
      answers: [
        { question: '最看重什么？', answer: '我更看重成长空间' },
        { question: '缓冲期多久？', answer: '储蓄可以支撑六个月' },
      ],
    },
    plan: { askUser: [] },
    memories: [],
    depthRoute: { depth: 'deep', reason: '重大职业选择', maxQuestions: 4 },
  });

  assert.deepEqual(decisionCase.facts.map((fact) => fact.value), [
    '我更看重成长空间',
    '储蓄可以支撑六个月',
  ]);
  assert.equal(decisionCase.readiness.answeredCount, 2);
  assert.equal(decisionCase.readiness.maxQuestions, 4);
  assert.equal(decisionCase.readiness.status, 'review');
});

test('recalled memories remain pending until the user explicitly selects them', () => {
  const draft = buildDecisionCase({
    session: { question: '要不要换工作', answers: [] },
    plan: { askUser: [] },
    memories: [{ id: 'mem_stability', content: '上次更看重稳定性', memory_type: 'preference' }],
    depthRoute: { depth: 'standard', reason: '一般职业取舍', maxQuestions: 3 },
  });

  assert.equal(draft.memoryCandidates[0].status, 'pending');
  assert.equal(draft.confirmedByUser, false);

  const confirmed = confirmDecisionCase(draft, {
    acceptedMemoryIds: ['mem_stability'],
    additionalContext: '这次成长空间更重要',
  }, '2026-08-08T00:00:00.000Z');

  assert.equal(confirmed.memoryCandidates[0].status, 'accepted');
  assert.equal(confirmed.facts.at(-1).value, '这次成长空间更重要');
  assert.equal(confirmed.confirmedByUser, true);
  assert.equal(confirmed.readiness.status, 'confirmed');
});

test('open questions stay visible as unknowns and are never promoted to facts', () => {
  const decisionCase = buildDecisionCase({
    session: { question: '要不要投资', answers: [] },
    plan: {
      askUser: [{ taskId: 'loss_limit', question: '最大能承受多少亏损？', reason: '决定风险边界' }],
    },
    memories: [],
    depthRoute: { depth: 'deep', reason: '金融高风险', maxQuestions: 4 },
  });

  assert.equal(decisionCase.facts.length, 0);
  assert.deepEqual(decisionCase.unknowns, [{
    id: 'loss_limit',
    question: '最大能承受多少亏损？',
    reason: '决定风险边界',
    status: 'open',
  }]);
  assert.equal(decisionCase.readiness.status, 'collecting');
});
