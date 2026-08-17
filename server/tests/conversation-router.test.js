import test from 'node:test';
import assert from 'node:assert/strict';
import { routeConversation, routeConversationHybrid } from '../src/services/conversationRouter.js';

test('deterministic arithmetic returns a direct answer without a session', () => {
  const result = routeConversation('1+1 等于几');

  assert.equal(result.lane, 'direct');
  assert.equal(result.answer, '2');
  assert.equal(result.requiresSession, false);
  assert.equal(result.complexity, 0);
});

test('a reversible everyday choice starts with useful guidance instead of a dossier', () => {
  const result = routeConversation('要不要去游乐园');

  assert.equal(result.lane, 'lightweight');
  assert.equal(result.requiresSession, false);
  assert.match(result.answer, /值得去|改期|犹豫/);
  assert.ok(result.quickChoices.length >= 3);
});

test('study choice enters deliberation while an everyday meal asks only relevant minimum context', () => {
  const study = routeConversation('要不要考研');
  const meal = routeConversation('要不要吃饭');

  assert.equal(study.lane, 'deep');
  assert.equal(study.requiresSession, true);
  assert.equal(meal.requiresSession, false);
  assert.match(meal.answer, /饥饿|上一餐|身体目标/);
  assert.deepEqual(meal.quickChoices.map((choice) => choice.label), ['饥饿程度', '上一餐时间', '身体目标']);
  assert.ok(meal.quickChoices.every((choice) => choice.action === 'start_session'));
});

test('real-time questions enter lookup and state what must be checked', () => {
  const result = routeConversation('今天上海迪士尼排队多久？');

  assert.equal(result.lane, 'lookup');
  assert.equal(result.requiresSession, true);
  assert.match(result.answer, /实时|查询|来源/);
});

test('multi-constraint consequential decisions enter deep deliberation', () => {
  const result = routeConversation('我和女朋友都在北京实习，预算两千，要不要先租房，通勤和转正都不确定');

  assert.equal(result.lane, 'deep');
  assert.equal(result.requiresSession, true);
  assert.ok(result.complexity >= 3);
  assert.match(result.answer, /预算|通勤|转正/);
});

test('a new job that requires relocation is never answered with a travel template', () => {
  const result = routeConversation('要不要接受一个需要搬家的新工作？');
  assert.equal(result.lane, 'deep');
  assert.equal(result.requiresSession, true);
  assert.equal(result.intentFrame.domain, 'career');
  assert.doesNotMatch(result.answer, /天气|排队|同行/);
});

test('high-risk health input enters the safety lane', () => {
  const result = routeConversation('我胸口剧痛而且呼吸困难，要不要继续等');

  assert.equal(result.lane, 'safety');
  assert.equal(result.requiresSession, false);
  assert.match(result.answer, /急救|就医|120/);
});

test('ambiguous fragments receive a natural repair instead of becoming facts', () => {
  const result = routeConversation('啥');

  assert.equal(result.lane, 'direct');
  assert.equal(result.requiresSession, false);
  assert.match(result.answer, /具体|想问|多说/);
});

test('hybrid routing asks the model only after deterministic gates and can promote a hidden complex choice', async () => {
  let calls = 0;
  const result = await routeConversationHybrid('要不要接受这个安排', {
    classify: async () => {
      calls += 1;
      return { lane: 'deep', complexity: 3, reason: '它涉及长期承诺与退出成本。' };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.lane, 'deep');
  assert.equal(result.requiresSession, true);
  assert.match(result.answer, /长期承诺/);
});

test('deterministic arithmetic never spends a model call', async () => {
  let calls = 0;
  const result = await routeConversationHybrid('1+1 等于几', {
    classify: async () => { calls += 1; return { lane: 'deep' }; },
  });
  assert.equal(calls, 0);
  assert.equal(result.answer, '2');
});
