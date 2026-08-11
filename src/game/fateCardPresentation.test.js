import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFateCardPresentation } from './fateCardPresentation.js';

test('fate card presentation keeps the real question, chosen path, and actions', () => {
  const result = buildFateCardPresentation({
    question: '要不要接受远程工作的机会，同时保留现在的客户？',
    selectedChoice: { label: '先做两周可逆试运行', keyPoints: ['确认交付边界', '记录精力变化'] },
    fateContent: { summary: '先验证协作成本，再决定是否长期切换。', source: 'model' },
  });

  assert.equal(result.question, '要不要接受远程工作的机会，同时保留现在的客户？');
  assert.equal(result.title, '先做两周可逆试运行');
  assert.deepEqual(result.actions, ['确认交付边界', '记录精力变化']);
  assert.equal(result.sourceMark, '灵');
  assert.equal(result.sourceLabel, '由模型根据本局案卷生成');
});

test('fate card presentation marks actual local fallback without preset wording', () => {
  const result = buildFateCardPresentation({
    question: '是否继续当前方案',
    inference: { source: 'preset-smart', fallback: true },
    fateContent: { source: 'local_fate_fallback', summary: '先做一次小范围验证。' },
  });

  assert.equal(result.sourceMark, '藏');
  assert.match(result.sourceLabel, /离线/);
  assert.doesNotMatch(JSON.stringify(result), /预设/);
  assert.deepEqual(result.actions, []);
});

test('fate card presentation uses the generated seal title instead of slicing the decision label', () => {
  const result = buildFateCardPresentation({
    selectedChoice: { label: '推进当前方案' },
    fateContent: {
      source: 'model',
      cardCopy: { sealTitle: '小步验真', verdict: '先验证再扩大。' },
    },
  });

  assert.equal(result.title, '小步验真');
  assert.equal(result.summary, '先验证再扩大。');
});

test('fate card presentation bounds display copy without inventing missing blocks', () => {
  const result = buildFateCardPresentation({
    question: '问'.repeat(100),
    fateContent: { summary: '结'.repeat(200), source: 'remote' },
  });

  assert.equal(result.question.length, 32);
  assert.equal(result.summary.length, 56);
  assert.equal(result.title, '');
  assert.deepEqual(result.actions, []);
});
