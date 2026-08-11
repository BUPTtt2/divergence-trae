import test from 'node:test';
import assert from 'node:assert/strict';

import { decisionUsagePresentation } from './decisionUsagePresentation.js';

test('does not present an unknown endpoint price as zero cost', () => {
  const usage = decisionUsagePresentation({
    calls: 1,
    tokens: { input: 100, output: 20, total: 120 },
    usageMissingCalls: 0,
    costMissingCalls: 1,
    estimatedCostCny: 0,
  });

  assert.equal(usage.measured, true);
  assert.equal(usage.cost, '成本待按模型单价核算');
});
