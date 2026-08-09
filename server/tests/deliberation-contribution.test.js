import test from 'node:test';
import assert from 'node:assert/strict';

import { validateDeliberationContribution } from '../src/services/deliberationContribution.js';
import { parseAdvisorFindingText } from '../src/services/reactLoop.js';

test('advisor output is separated into claim, reasoning, assumptions and reversal conditions', () => {
  const result = parseAdvisorFindingText(`【主张】先不要加餐。\n【依据】你刚吃过正餐，当前只是嘴馋。\n【假设】没有低血糖或明显不适；上一餐信息准确。\n【反转条件】出现持续饥饿；出现头晕或乏力。`);

  assert.equal(result.claim, '先不要加餐。');
  assert.equal(result.reasoning, '你刚吃过正餐，当前只是嘴馋。');
  assert.deepEqual(result.assumptions, ['没有低血糖或明显不适', '上一餐信息准确']);
  assert.deepEqual(result.reversalConditions, ['出现持续饥饿', '出现头晕或乏力']);
});

test('quick deliberation requires one traceable advisor finding', () => {
  const result = validateDeliberationContribution({
    plan: { depth: 'quick', selectedAgentIds: ['health'] },
    findings: [{ agentId: 'health', claim: '先区分生理饥饿与进食冲动' }],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.requiredCount, 1);
  assert.deepEqual(result.successfulAgentIds, ['health']);
});

test('standard deliberation cannot pass with only one advisor contribution', () => {
  const result = validateDeliberationContribution({
    plan: { depth: 'standard', selectedAgentIds: ['health', 'reflection'] },
    findings: [{ agentId: 'health', content: '先确认身体信号' }],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.requiredCount, 2);
  assert.equal(result.actualCount, 1);
  assert.deepEqual(result.missingAgentIds, ['reflection']);
});

test('unselected advisor output cannot satisfy the confirmed council gate', () => {
  const result = validateDeliberationContribution({
    plan: { depth: 'standard', selectedAgentIds: ['health', 'reflection'] },
    findings: [
      { agentId: 'health', content: '检查身体信号' },
      { agentId: 'finance', content: '考虑价格' },
    ],
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.successfulAgentIds, ['health']);
});
