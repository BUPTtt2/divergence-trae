import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCaseIntake, fallbackCaseFields } from '../src/services/caseAnalystService.js';

test('case analyst creates context-specific dependent questions and keeps interpretation separate', async () => {
  const result = await analyzeCaseIntake({
    question: '要不要北京租房',
    answers: [{ fieldId: 'living_context', answer: '我和女朋友都在找实习' }],
    previousFields: [{ id: 'living_context', prompt: '涉及哪些人？' }],
  }, {
    callLLMFn: async () => JSON.stringify({
      understanding: '两人准备共同租房，但工作地点尚未确定。',
      interpretations: [{ id: 'unstable_anchor', fieldId: 'work_anchor', value: '通勤锚点尚未稳定', evidence: '两人都在找实习', confidence: 0.88 }],
      unknowns: ['工作地点', '预算口径'],
      conflicts: [],
      informationFields: [
        { id: 'living_context', prompt: '这次租房涉及哪些人？', reason: '确认共同决策者', decisionImpact: '影响房型', dependsOn: [], required: true },
        { id: 'work_anchor', prompt: '实习地点未定时，你们最可能投哪些区域？', reason: '先形成候选通勤锚点', decisionImpact: '决定搜索范围', dependsOn: ['living_context'], required: true, answerType: 'location' },
        { id: 'budget_boundary', prompt: '2000 元是总租金还是个人承担额？', reason: '确认预算口径', decisionImpact: '决定可行房型', dependsOn: ['living_context'], required: true, answerType: 'number' },
      ],
    }),
  });

  assert.equal(result.source, 'model');
  assert.equal(result.informationFields[1].dependsOn[0], 'living_context');
  assert.match(result.informationFields[1].prompt, /实习地点未定/);
  assert.equal(result.inferences[0].status, 'pending');
  assert.equal(result.unknownLabels.length, 2);
});

test('rental fallback asks concrete housing questions instead of two generic prompts', () => {
  const fields = fallbackCaseFields('要不要北京租房');
  assert.ok(fields.length >= 5);
  assert.ok(fields.some((field) => field.id === 'budget_boundary'));
  assert.ok(fields.some((field) => field.id === 'commute_boundary'));
  assert.equal(fields.some((field) => field.prompt === '你现在的实际状态是什么？'), false);
});

test('case analyst keeps a useful model field and fills missing coverage instead of discarding the model result', async () => {
  const result = await analyzeCaseIntake({ question: '要不要北京租房' }, {
    callLLMFn: async () => JSON.stringify({
      understanding: '两人想在北京共同租房，但预算口径尚未确定。',
      interpretations: [],
      unknowns: ['预算口径'],
      conflicts: [],
      informationFields: [{
        id: 'budget_meaning',
        prompt: '你说的预算是两人总价还是你个人承担额？',
        reason: '先统一预算口径。',
        decisionImpact: '决定房型和区域。',
        dependsOn: [],
        required: true,
        answerType: 'number',
      }],
    }),
  });

  assert.equal(result.source, 'model');
  assert.equal(result.understanding, '两人想在北京共同租房，但预算口径尚未确定。');
  assert.ok(result.informationFields.length >= 2);
  assert.ok(result.informationFields.some((field) => field.id === 'budget_meaning'));
});

test('case analyst retains the latest understanding and field contract when a later model call is invalid', async () => {
  const previousFields = fallbackCaseFields('要不要北京租房');
  const result = await analyzeCaseIntake({
    question: '要不要北京租房',
    answers: [{ fieldId: 'living_context', answer: '我和女朋友一起住，我的实习已确定。' }],
    previousFields,
    previousAnalysis: { understanding: '两人共同租房，用户实习地点已经确定。' },
  }, { callLLMFn: async () => '这不是 JSON' });

  assert.equal(result.source, 'retained-analysis-fallback');
  assert.equal(result.understanding, '两人共同租房，用户实习地点已经确定。');
  assert.deepEqual(result.informationFields.map((field) => field.id), previousFields.map((field) => field.id));
});
