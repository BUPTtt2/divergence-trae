import test from 'node:test';
import assert from 'node:assert/strict';

import { plan } from '../src/services/planner.js';

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

test('planner reuses the case analyst field contract between dependent intake answers', async () => {
  let analystCalls = 0;
  const dependencies = {
    analyzeCaseIntakeFn: async () => {
      analystCalls += 1;
      return analysis;
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
  assert.equal(analystCalls, 1);
  assert.match(second.plan.caseAnalysis.understanding, /我和女朋友一起住/);
  assert.deepEqual(second.plan.caseAnalysis.unknownLabels, ['工作地点', '预算口径']);
});
