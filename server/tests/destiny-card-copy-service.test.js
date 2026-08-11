import test from 'node:test';
import assert from 'node:assert/strict';

import { createDestinyCardCopy } from '../src/services/destinyCardCopyService.js';

test('accepts concise generated copy and marks its real source', async () => {
  const copy = await createDestinyCardCopy({
    question: '我要不要继续投入',
    decision: '先做两周验证',
    summary: '先验证关键假设，再决定是否扩大投入。',
    actions: ['两周内完成验证'],
    reversals: ['验证低于阈值即停止'],
    hexagram: '风山渐',
  }, {
    callLLMImpl: async () => '```json\n{"sealTitle":"渐行验真","verse":"山行有序，渐进有成","verdict":"先以小步换取真实反馈","insight":"判断不靠想象","nextAction":"两周内完成验证","guardrail":"低于阈值即停止"}\n```',
  });
  assert.equal(copy.source, 'generated');
  assert.equal(copy.sealTitle, '渐行验真');
  assert.equal(copy.verse, '山行有序，渐进有成');
  assert.equal(copy.nextAction, '两周内完成验证');
});

test('malformed model output falls back to real dossier fields without preset copy', async () => {
  const copy = await createDestinyCardCopy({
    decision: '先做两周验证',
    summary: '先验证关键假设，再决定是否扩大投入。',
    actions: ['两周内完成验证'],
    reversals: ['验证低于阈值即停止'],
  }, { callLLMImpl: async () => 'not json' });
  assert.equal(copy.source, 'structured');
  assert.match(copy.verdict, /验证/);
  assert.equal(JSON.stringify(copy).includes('预设'), false);
});

test('generated fields are clamped to the card contract', async () => {
  const long = '很长'.repeat(60);
  const copy = await createDestinyCardCopy({}, {
    callLLMImpl: async () => JSON.stringify({ sealTitle: long, verse: long, verdict: long, insight: long, nextAction: long, guardrail: long }),
  });
  assert.equal(copy.sealTitle.length <= 5, true);
  assert.equal(copy.verse.length <= 28, true);
  assert.equal(copy.verdict.length <= 42, true);
  assert.equal(copy.insight.length <= 24, true);
});
