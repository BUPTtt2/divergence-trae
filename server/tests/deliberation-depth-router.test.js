import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuickPlan, routeDeliberationDepth } from '../src/services/deliberationDepthRouter.js';

test('question risk selects an explicit field and round budget', () => {
  assert.deepEqual(routeDeliberationDepth('要不要吃饭'), {
    depth: 'quick',
    reason: '低风险、可逆的即时日常选择',
    maxQuestions: 3,
    maxRounds: 2,
  });
  assert.deepEqual(routeDeliberationDepth('周末要不要去看展'), {
    depth: 'standard',
    reason: '需要拆解取舍并核对信息',
    maxQuestions: 3,
  });
  assert.equal(routeDeliberationDepth('要不要辞职去创业').depth, 'deep');
  assert.equal(routeDeliberationDepth('要不要辞职去创业').maxQuestions, 4);
  assert.equal(routeDeliberationDepth('胸口疼要不要吃药').depth, 'deep');
});

test('quick food planning asks three non-leading fields and assigns complementary advisors', () => {
  const result = buildQuickPlan({ id: 'sess_quick', question: '要不要吃饭', round: 1 });

  assert.equal(result.session.state, 'WAIT');
  assert.equal(result.plan.depth, 'quick');
  assert.equal(result.plan.agents.length, 2);
  assert.deepEqual(result.plan.dimensions.map((dimension) => dimension.name), ['身体信号', '进食情境', '当前目标']);
  assert.deepEqual(result.askUser.map((item) => item.fieldId), ['body_signal', 'meal_context', 'current_goal']);
  assert.equal(result.askUser.some((item) => /你现在有明显饥饿感/.test(item.question)), false);
  assert.equal(new Set(result.plan.agents.map((agent) => agent.perspective)).size, 2);
});

test('quick food planning does not proceed when one vague answer is copied across fields', () => {
  const result = buildQuickPlan({
    id: 'sess_quick_answered',
    question: '要不要吃饭',
    question_context: '要不要吃饭 补充：有点饿，五小时前吃的',
    answers: [{ answer: '不知道，随便' }],
    round: 2,
  });

  assert.equal(result.session.state, 'WAIT');
  assert.equal(result.plan.caseFile.confirmedByUser, false);
  assert.equal(result.askUser.length, 3);
  assert.equal(result.plan.caseFile.unknowns.length, 3);
});

test('quick food planning upgrades after complete weight-management answers', () => {
  const result = buildQuickPlan({
    id: 'sess_quick_weight',
    question: '要不要吃饭',
    answers: [
      { fieldId: 'body_signal', question: '身体感受', answer: '不饿，只是嘴馋' },
      { fieldId: 'meal_context', question: '上一餐', answer: '一小时前刚吃过很多' },
      { fieldId: 'current_goal', question: '当前目标', answer: '正在减脂' },
    ],
    round: 2,
  });

  assert.equal(result.session.state, 'READY');
  assert.equal(result.plan.depth, 'standard');
  assert.equal(result.plan.orchestration.escalation.to, 'standard');
  assert.equal(result.plan.caseFile.unknowns.length, 0);
});
