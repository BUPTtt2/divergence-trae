import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOpsViewModel } from './opsModel.js';

test('ops model never presents a zero-sample rate as a real trend', () => {
  const view = buildOpsViewModel({ overview: { metrics: { starts: 0, completions: 0, completionRate: { numerator: 0, denominator: 0, rate: null }, durationMs: { samples: 0 } } } });
  assert.equal(view.completion.label, '暂无样本');
  assert.equal(view.duration, '暂无可核对时长');
});

test('ops model exposes the numerator, denominator, and a low-sample warning', () => {
  const view = buildOpsViewModel({ overview: { metrics: { starts: 4, completions: 3, completionRate: { numerator: 3, denominator: 4, rate: 0.75 }, durationMs: { p50: 120000, p90: 240000, samples: 3 } } } });
  assert.equal(view.completion.label, '75%');
  assert.equal(view.completion.detail, '3 / 4 局');
  assert.equal(view.completion.lowSample, true);
  assert.equal(view.duration, 'P50 2分 · P90 4分');
});
