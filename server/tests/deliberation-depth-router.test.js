import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuickPlan, routeDeliberationDepth } from '../src/services/deliberationDepthRouter.js';

test('question risk selects an explicit 1, 3 or 4 question information budget', () => {
  assert.deepEqual(routeDeliberationDepth('要不要吃饭'), {
    depth: 'quick',
    reason: '低风险、可逆的即时日常选择',
    maxQuestions: 1,
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

test('quick food planning asks one useful body-signal question on round one', () => {
  const result = buildQuickPlan({ id: 'sess_quick', question: '要不要吃饭', round: 1 });

  assert.equal(result.session.state, 'WAIT');
  assert.equal(result.plan.depth, 'quick');
  assert.equal(result.plan.agents.length, 1);
  assert.deepEqual(result.plan.dimensions.map((dimension) => dimension.name), ['身体信号', '时间与节律']);
  assert.equal(result.askUser.length, 1);
  assert.match(result.askUser[0].question, /饥饿|上次正餐/);
});

test('quick food planning proceeds after the user has answered once', () => {
  const result = buildQuickPlan({
    id: 'sess_quick_answered',
    question: '要不要吃饭',
    question_context: '要不要吃饭 补充：有点饿，五小时前吃的',
    answers: [{ answer: '有点饿，五小时前吃的' }],
    round: 2,
  });

  assert.equal(result.session.state, 'READY');
  assert.equal(result.plan.caseFile.confirmedByUser, false);
  assert.equal(result.askUser.length, 0);
  assert.match(result.plan.analysis, /快推演/);
});
