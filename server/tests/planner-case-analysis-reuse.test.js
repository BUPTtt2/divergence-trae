import test from 'node:test';
import assert from 'node:assert/strict';

import { plan } from '../src/services/planner.js';
import { analyzeCaseIntake, fallbackCaseFields } from '../src/services/caseAnalystService.js';
import { summarizeCaseRound } from '../src/services/informationSufficiency.js';

const analysis = {
  source: 'model',
  understanding: '用户与伴侣考虑在北京共同租房，工作地点和预算口径仍未确认。',
  informationFields: [
    {
      id: 'living_context',
      prompt: '这次租房涉及哪些人？',
      reason: '确认共同决策者。',
      decisionImpact: '决定居住方式。',
      dependsOn: [],
      required: true,
      source: 'case-analyst-agent',
    },
    {
      id: 'work_anchor',
      prompt: '你们的工作地点确定了吗？',
      reason: '形成通勤锚点。',
      decisionImpact: '决定搜索区域。',
      dependsOn: ['living_context'],
      required: true,
      source: 'case-analyst-agent',
    },
  ],
  inferences: [],
  unknownLabels: ['工作地点', '预算口径'],
  conflicts: [],
};

test('planner re-runs the case analyst after each intake round so the next questions can adapt', async () => {
  let analystCalls = 0;
  const dependencies = {
    analyzeCaseIntakeFn: async ({ answers, previousFields }) => {
      analystCalls += 1;
      if (answers.length === 0) return analysis;
      assert.deepEqual(previousFields.map((field) => field.id), ['living_context', 'work_anchor']);
      return {
        ...analysis,
        understanding: '用户与女朋友一起住，下一轮需要确认两人的实习候选区域。',
        informationFields: [
          ...analysis.informationFields,
          {
            id: 'candidate_work_areas',
            prompt: '你们目前分别优先投哪些区域的实习？',
            reason: '根据共同居住回答生成候选通勤锚点。',
            decisionImpact: '决定搜索区域。',
            dependsOn: ['living_context'],
            required: true,
            source: 'case-analyst-agent',
          },
        ],
        unknownLabels: ['两人的候选实习区域', '预算口径'],
      };
    },
    saveSessionFn: async (session) => ({ ...session, id: session.id }),
  };

  const first = await plan({
    id: 'sess_case_reuse',
    user_id: 'user_case_reuse',
    question: '要不要和女朋友在北京租房',
    round: 1,
    answers: [],
  }, dependencies);

  assert.equal(first.askUser[0].fieldId, 'living_context');
  assert.equal(analystCalls, 1);

  const second = await plan({
    ...first.session,
    answers: [{
      fieldId: 'living_context',
      question: '这次租房涉及哪些人？',
      answer: '我和女朋友一起住。',
    }],
  }, dependencies);

  assert.equal(second.askUser[0].fieldId, 'work_anchor');
  assert.equal(analystCalls, 2);
  assert.match(second.plan.caseAnalysis.understanding, /下一轮需要确认/);
  assert.deepEqual(second.plan.caseAnalysis.unknownLabels, ['两人的候选实习区域', '预算口径']);
});

test('planner keeps a study case in intake after the first answer batch and asks a newly generated second round', async () => {
  const firstRoundFields = fallbackCaseFields('要不要考研');
  const result = await plan({
    id: 'sess_study_round_two',
    user_id: 'user_study_round_two',
    question: '要不要考研',
    round: 2,
    answers: [
      { fieldId: 'study_outcome', question: firstRoundFields[0].prompt, answer: '主要想提升薪资。' },
      { fieldId: 'study_readiness', question: firstRoundFields[1].prompt, answer: '现在专心实习，还没有正式备考。' },
      { fieldId: 'study_tradeoff', question: firstRoundFields[2].prompt, answer: '最多投入一年，也想直接工作。' },
    ],
    plan: {
      informationFields: firstRoundFields,
      caseAnalysis: { understanding: '用户考虑考研，但目标岗位和替代路径尚未确认。' },
    },
  }, {
    analyzeCaseIntakeFn: (input) => analyzeCaseIntake(input, { callLLMFn: async () => '{ invalid json' }),
    saveSessionFn: async (session) => session,
  });

  assert.equal(result.session.state, 'WAIT');
  assert.deepEqual(result.askUser.map((item) => item.fieldId), [
    'study_target_path',
    'study_alternative_path',
  ]);
  assert.equal(result.plan.agents.length, 0);
  assert.match(result.plan.caseAnalysis.understanding, /主要想提升薪资/);
});

test('planner prioritizes adaptive study blockers even when the model returns generic follow-up fields', async () => {
  const firstRoundFields = fallbackCaseFields('要不要考研');
  const modelResponse = JSON.stringify({
    understanding: '用户希望提升薪资，正在实习，尚未开始备考。',
    interpretations: [],
    unknowns: ['目标岗位', '直接工作路径'],
    conflicts: [],
    informationFields: [
      {
        id: 'career_goals',
        prompt: '你的长期职业目标是什么？',
        reason: '了解职业目标。',
        decisionImpact: '影响选择。',
        dependsOn: [],
        required: true,
        blocking: true,
        answerType: 'text',
      },
      {
        id: 'financial_situation',
        prompt: '家庭经济情况如何？',
        reason: '了解经济支持。',
        decisionImpact: '影响成本。',
        dependsOn: [],
        required: true,
        blocking: true,
        answerType: 'text',
      },
    ],
  });

  const result = await plan({
    id: 'sess_study_model_round_two',
    user_id: 'user_study_model_round_two',
    question: '要不要考研',
    round: 2,
    answers: [
      { fieldId: 'study_outcome', question: firstRoundFields[0].prompt, answer: '主要想提升薪资。' },
      { fieldId: 'study_readiness', question: firstRoundFields[1].prompt, answer: '现在专心实习，还没有正式备考。' },
      { fieldId: 'study_tradeoff', question: firstRoundFields[2].prompt, answer: '最多投入一年，也想直接工作。' },
    ],
    plan: {
      informationFields: [
        ...firstRoundFields,
        {
          id: 'career_goals',
          prompt: '你的长期职业目标是什么？',
          reason: '旧一轮模型生成的泛化问题。',
          decisionImpact: '可能影响选择。',
          required: true,
          blocking: true,
          askInIntake: true,
          answerType: 'text',
        },
      ],
      caseAnalysis: { understanding: '用户考虑考研。' },
    },
  }, {
    analyzeCaseIntakeFn: (input) => analyzeCaseIntake(input, { callLLMFn: async () => modelResponse }),
    saveSessionFn: async (session) => session,
  });

  assert.equal(result.session.state, 'WAIT');
  assert.deepEqual(result.askUser.map((item) => item.fieldId), [
    'study_target_path',
    'study_alternative_path',
  ]);
  assert.equal(result.plan.informationFields.find((field) => field.id === 'career_goals')?.askInIntake, false);
  assert.equal(result.plan.informationFields.find((field) => field.id === 'career_goals')?.blocking, false);
});

test('case round summary separates confirmed facts, blocking unknowns, and retained conditions', () => {
  const summary = summarizeCaseRound({
    question: '要不要考研',
    answers: [{ fieldId: 'study_outcome', answer: '想进入算法岗位。' }],
    caseAnalysis: { understanding: '用户把考研作为进入算法岗位的一种路径。' },
    sufficiency: {
      complete: false,
      readiness: { reason: '仍有会直接改变路径的阻断信息需要确认。' },
      fieldStates: [
        { id: 'study_outcome', prompt: '读研想换来什么？', status: 'answered', rawValue: '想进入算法岗位。', blocking: true },
        { id: 'study_readiness', prompt: '目前备考基础怎样？', status: 'open', rawValue: '', blocking: true, reason: '影响可行性。' },
        { id: 'study_support', prompt: '有哪些支持条件？', status: 'open', rawValue: '', blocking: false, reason: '影响执行韧性。' },
      ],
    },
  });

  assert.deepEqual(summary.confirmedFacts, [{
    id: 'study_outcome',
    question: '读研想换来什么？',
    value: '想进入算法岗位。',
    source: 'user',
  }]);
  assert.equal(summary.userGoal, '要不要考研');
  assert.equal(summary.userQuote, '要不要考研');
  assert.equal(summary.systemUnderstanding, '用户把考研作为进入算法岗位的一种路径。');
  assert.deepEqual(summary.criticalUnknowns.map((item) => item.id), ['study_readiness']);
  assert.deepEqual(summary.retainedConditions.map((item) => item.id), ['study_support']);
  assert.equal(summary.needsNextRound, true);
  assert.match(summary.nextRoundReason, /阻断信息/);
});

test('explicit continue-with-current-information downgrades a blocking unknown into a retained condition', () => {
  const summary = summarizeCaseRound({
    question: '要不要考研',
    answers: [{ fieldId: 'study_readiness', answer: '按现有信息继续' }],
    caseAnalysis: { understanding: '用户选择带着备考基础未知继续。' },
    sufficiency: {
      complete: true,
      readiness: { reason: '阻断判断的信息已回答或由用户明确授权保留未知。' },
      fieldStates: [
        { id: 'study_readiness', prompt: '目前备考基础怎样？', status: 'skipped', rawValue: '', blocking: true, reason: '用户明确授权带着该未知继续。' },
      ],
    },
  });

  assert.deepEqual(summary.criticalUnknowns, []);
  assert.deepEqual(summary.retainedConditions.map((item) => item.id), ['study_readiness']);
  assert.equal(summary.needsNextRound, false);
});
