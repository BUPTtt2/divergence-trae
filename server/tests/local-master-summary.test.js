import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalMasterSummary } from '../src/services/agentEngine.js';

test('food fallback turns confirmed context into actionable paths instead of empty divination copy', () => {
  const result = buildLocalMasterSummary(
    '要不要吃饭\n用户已确认案卷：\n- 不饿，但有点嘴馋\n- 两小时前吃过正常一餐\n- 我主要想控制体重，同时别影响睡眠',
    ['jiankang', 'xinhe', 'jingyuan'],
    {},
  );

  assert.match(result.summary, /不饿|嘴馋/);
  assert.match(result.summary, /两小时前|正常一餐/);
  assert.match(result.summary, /控制体重|睡眠/);
  assert.doesNotMatch(result.summary, /听从本心|推演已凝于此刻/);
  assert.deepEqual(result.options.map((option) => option.label), [
    '先不加餐 · 观察十分钟',
    '确有饥饿 · 少量补充',
    '仍想进食 · 记录触发因素',
  ]);
});

test('generic fallback still exposes reversible next steps when no dialogue exists', () => {
  const result = buildLocalMasterSummary('要不要接受这个 Offer', [], {});

  assert.doesNotMatch(result.summary, /听从本心|择一而行/);
  assert.equal(result.options.length, 3);
  assert.match(result.options[0].label, /验证|试行/);
});
