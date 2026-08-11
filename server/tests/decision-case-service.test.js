import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptedCaseContext, buildDecisionCase, confirmDecisionCase } from '../src/services/decisionCaseService.js';

test('explicit context in the original question enters the case file before clarification', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '我和女朋友都在北京实习，预算两千，要不要先租房，通勤和转正都不确定',
      answers: [],
    },
    plan: { informationFields: [], askUser: [] },
    depthRoute: { depth: 'deep', reason: '多约束居住选择' },
  });

  assert.deepEqual(decisionCase.facts.map((fact) => fact.value), [
    '我和女朋友都在北京实习',
    '预算两千',
    '通勤和转正都不确定',
  ]);
  assert.equal(decisionCase.facts.every((fact) => fact.source === 'user-question'), true);
});

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
    blocking: true,
    tier: 'blocking',
  }]);
  assert.equal(decisionCase.readiness.status, 'collecting');
});

test('decision case keeps inferred understanding separate from confirmed user facts', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要吃饭',
      answers: [{ fieldId: 'body_signal', question: '身体感受', answer: '不饿' }],
      information_inferences: [{
        id: 'intent_1',
        fieldId: 'current_goal',
        value: '可能正在控制体重',
        confidence: 0.62,
        evidence: '用户提到最近吃得超量',
      }],
    },
    plan: {
      askUser: [{ fieldId: 'current_goal', question: '你此刻主要目标是什么？', reason: '目标影响建议' }],
    },
    depthRoute: { depth: 'quick', reason: '低风险日常选择', maxQuestions: 3 },
  });

  assert.equal(decisionCase.facts.length, 1);
  assert.equal(decisionCase.inferences.length, 1);
  assert.equal(decisionCase.inferences[0].status, 'pending');
  assert.equal(decisionCase.unknowns[0].id, 'current_goal');
});

test('decision case keeps ambiguous answer out of confirmed facts', () => {
  const informationFields = [{
    id: 'body_signal',
    prompt: '你此刻更接近哪种状态：真正饿、只是嘴馋、吃撑了，还是没有食欲？',
    reason: '先区分身体需要和进食冲动。',
    required: true,
  }];
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要吃饭',
      answers: [{ fieldId: 'body_signal', answer: '2' }],
    },
    plan: { informationFields, askUser: [] },
    depthRoute: { depth: 'quick', reason: '低风险日常选择', maxQuestions: 3 },
  });

  assert.equal(decisionCase.facts.length, 0);
  assert.equal(decisionCase.unknowns[0].id, 'body_signal');
  assert.equal(decisionCase.unknowns[0].status, 'ambiguous');
  assert.equal(decisionCase.readiness.status, 'collecting');
  assert.deepEqual(decisionCase.readiness.unresolvedAmbiguities, ['body_signal']);
});

test('explicitly skipped fields stay visible as authorized unknowns without blocking review', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要吃饭',
      answers: [{ fieldId: 'meal_context', answer: '用户选择跳过本项澄清' }],
    },
    plan: {
      askUser: [],
      informationFields: [{ id: 'meal_context', prompt: '上一餐是什么时候？', reason: '进食间隔会影响建议' }],
    },
    depthRoute: { depth: 'quick', reason: '低风险日常选择', maxQuestions: 3 },
  });

  assert.equal(decisionCase.facts.length, 0);
  assert.deepEqual(decisionCase.unknowns, [{
    id: 'meal_context',
    question: '上一餐是什么时候？',
    reason: '用户选择暂不提供；结论必须保留条件，不得把它当成事实。',
    status: 'skipped',
    blocking: true,
    tier: 'blocking',
  }]);
  assert.equal(decisionCase.readiness.status, 'review');
  assert.equal(decisionCase.readiness.openUnknownCount, 0);
});

test('a search result count is not promoted into the confirmed fact column', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要北京租房',
      answers: [],
      tool_results: [{ ok: true, tool: 'web_search', summary: '找到 5 条结果' }],
    },
    plan: { askUser: [] },
    depthRoute: { depth: 'standard', reason: '租房决策', maxQuestions: 5 },
  });

  assert.equal(decisionCase.facts.length, 0);
});

test('decision case question budget expands to the actual adaptive field set', () => {
  const informationFields = Array.from({ length: 6 }, (_, index) => ({
    id: `field_${index + 1}`,
    prompt: `关键问题 ${index + 1}`,
    required: true,
  }));
  const decisionCase = buildDecisionCase({
    session: { question: '要不要北京租房', answers: [] },
    plan: { maxQuestions: 6, informationFields, askUser: [] },
    depthRoute: { depth: 'standard', reason: '租房决策', maxQuestions: 3 },
  });

  assert.equal(decisionCase.readiness.maxQuestions, 6);
});

test('confidence unknowns remain visible without blocking case review', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要北京租房',
      answers: [{ fieldId: 'shared_intent', answer: '我们已经决定一起租' }],
    },
    plan: {
      informationFields: [
        { id: 'shared_intent', prompt: '双方是否同意？', required: true, blocking: true, unknownTier: 'blocking' },
        { id: 'district', prompt: '偏好哪个区域？', required: true, blocking: false, unknownTier: 'confidence' },
      ],
      askUser: [],
    },
    depthRoute: { depth: 'standard', reason: '租房决策' },
  });

  assert.equal(decisionCase.readiness.status, 'review');
  assert.equal(decisionCase.readiness.openBlockingUnknownCount, 0);
  assert.equal(decisionCase.readiness.retainedUnknownCount, 1);
  assert.equal(decisionCase.unknowns[0].blocking, false);
  assert.doesNotThrow(() => confirmDecisionCase(decisionCase, {}));
});

test('analyst unknowns do not repeat a topic the user already answered', () => {
  const decisionCase = buildDecisionCase({
    session: {
      question: '要不要北京租房',
      answers: [{ fieldId: 'budget', question: '租房预算是多少？', answer: '1500 到 2300 元' }],
      case_unknown_labels: [
        '用户对北京租房的具体预算范围是什么？',
        '用户对租房地点和区域有何要求？',
      ],
    },
    plan: {
      informationFields: [
        { id: 'budget', prompt: '租房预算是多少？', required: true, blocking: true },
      ],
      askUser: [],
    },
    depthRoute: { depth: 'standard', reason: '租房决策' },
  });

  assert.equal(decisionCase.unknowns.some((unknown) => /预算/.test(unknown.question)), false);
  assert.equal(decisionCase.unknowns.some((unknown) => /地点和区域/.test(unknown.question)), true);
});

test('blocking unknowns require an explicit continue-with-unknown authorization', () => {
  const decisionCase = buildDecisionCase({
    session: { question: '要不要北京租房', answers: [] },
    plan: {
      informationFields: [
        { id: 'shared_intent', prompt: '双方是否同意？', required: true, blocking: true, unknownTier: 'blocking' },
      ],
      askUser: [],
    },
    depthRoute: { depth: 'standard', reason: '租房决策' },
  });

  assert.equal(decisionCase.readiness.status, 'collecting');
  assert.throws(() => confirmDecisionCase(decisionCase, {}), { code: 'CASE_NOT_READY' });
  const confirmed = confirmDecisionCase(decisionCase, { authorizeUnknownIds: ['shared_intent'] });
  assert.equal(confirmed.confirmedByUser, true);
  assert.equal(confirmed.unknowns[0].status, 'authorized');
});

test('advisors receive retained unknowns as explicit non-facts', () => {
  const context = acceptedCaseContext({
    facts: [{ value: '用户希望提升薪资' }],
    unknowns: [{ question: '家庭是否支持长期备考？', status: 'authorized' }],
  });

  assert.equal(context[0], '用户希望提升薪资');
  assert.match(context[1], /未确认信息（不得当作事实）/);
  assert.match(context[1], /家庭是否支持长期备考/);
});
