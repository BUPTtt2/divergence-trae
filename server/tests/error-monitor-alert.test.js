import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLLMErrorAlert } from '../src/middleware/errorMonitor.js';

test('LLM alert is content-free and only fires above the sample and error thresholds', () => {
  const now = Date.now();
  const results = [
    { timestamp: now, success: false, errorType: 'timeout', content: 'private' },
    { timestamp: now, success: false, errorType: 'timeout' },
    { timestamp: now, success: true },
    { timestamp: now, success: true },
    { timestamp: now, success: true },
  ];
  const alert = buildLLMErrorAlert(results, now);
  assert.equal(alert.code, 'LLM_ERROR_RATE_HIGH');
  assert.equal(alert.summary.includes('2/5'), true);
  assert.equal(JSON.stringify(alert).includes('private'), false);
  assert.equal(buildLLMErrorAlert(results.slice(0, 4), now), null);
});
