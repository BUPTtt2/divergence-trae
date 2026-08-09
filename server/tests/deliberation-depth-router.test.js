import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInformationOrchestration } from '../src/services/informationSufficiency.js';
import { buildIntakePlan, buildQuickPlan, routeDeliberationDepth } from '../src/services/deliberationDepthRouter.js';

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

test('quick food planning asks only the next non-leading field and assigns complementary advisors', () => {
  const result = buildQuickPlan({ id: 'sess_quick', question: '要不要吃饭', round: 1 });

  assert.equal(result.session.state, 'WAIT');
  assert.equal(result.plan.depth, 'quick');
  assert.equal(result.plan.agents.length, 2);
  assert.deepEqual(result.plan.dimensions.map((dimension) => dimension.name), ['身体信号', '进食情境', '当前目标']);
  assert.deepEqual(result.askUser.map((item) => item.fieldId), ['body_signal']);
  assert.equal(result.nextQuestion.fieldId, 'body_signal');
  assert.equal(result.readiness.status, 'collecting');
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
  assert.equal(result.askUser.length, 1);
  assert.equal(result.askUser[0].fieldId, 'body_signal');
  assert.match(result.askUser[0].question, /2.*指|量表|选项|状态/);
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
  assert.equal(result.nextQuestion, null);
  assert.equal(result.readiness.status, 'review');
});

test('standard product decisions stop at one adaptive question before any advisor is assigned', () => {
  const session = {
    id: 'sess_product_intake',
    question: '复赛前应该继续加功能，还是先做稳定性？',
    round: 1,
    answers: [],
  };
  const route = routeDeliberationDepth(session.question);
  const orchestration = buildInformationOrchestration({
    question: session.question,
    answers: session.answers,
    round: session.round,
    depth: route.depth,
  });
  const result = buildIntakePlan(session, orchestration, route);

  assert.equal(result.session.state, 'WAIT');
  assert.equal(result.plan.depth, 'standard');
  assert.equal(result.plan.agents.length, 0);
  assert.deepEqual(result.askUser.map((item) => item.fieldId), ['product_reality']);
  assert.equal(result.plan.readiness.openRequiredFields.length, 3);
});

test('product intake reveals dependent questions one at a time and reaches review only when resolved', () => {
  const question = '复赛前应该继续加功能，还是先做稳定性？';
  const first = buildInformationOrchestration({
    question,
    answers: [{ fieldId: 'product_reality', answer: '核心流程能跑通，但 iPad 小窗布局仍会遮挡操作。' }],
    round: 2,
    depth: 'standard',
  });
  assert.equal(first.sufficiency.complete, false);
  assert.equal(first.sufficiency.nextQuestion.id, 'delivery_constraint');

  const complete = buildInformationOrchestration({
    question,
    answers: [
      { fieldId: 'product_reality', answer: '核心流程能跑通，但 iPad 小窗布局仍会遮挡操作。' },
      { fieldId: 'delivery_constraint', answer: '明天验收，必须保留完整提问、智囊推演与最终行动路径。' },
      { fieldId: 'success_criterion', answer: '评审可以独立从头走完，并看见智囊各自的真实贡献。' },
    ],
    round: 4,
    depth: 'standard',
  });
  assert.equal(complete.sufficiency.complete, true);
  assert.equal(complete.sufficiency.nextQuestion, null);
  assert.equal(complete.sufficiency.readiness.status, 'review');
});
