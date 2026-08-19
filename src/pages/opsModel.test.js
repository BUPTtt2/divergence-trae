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

test('ops model exposes session capacity and refuses to present missing prices as zero-cost truth', () => {
  const view = buildOpsViewModel({
    costs: {
      summary: {
        calls: 8, successfulCalls: 6, failedCalls: 2, usageMissingCalls: 1, costMissingCalls: 2,
        tokens: { input: 10000, output: 3000, total: 13000 }, estimatedCostCny: 1.25,
        byProvider: { 'budget-gate': { failedCalls: 1 } },
      },
      capacity: {
        limits: { sessionTokenEnvelope: 250000, userDailySessions: 3, globalDailySessions: 100, maxActiveSessions: 20 },
        observed: { activeSessions: 4, settledSessions: 12, releasedSessions: 2, p90ActualTokens: 130000 },
      },
    },
  });

  assert.deepEqual(view.costs.tokens, { input: 10000, output: 3000, total: 13000 });
  assert.equal(view.costs.knownCostLabel, '¥1.2500 + 2 次价格未知');
  assert.equal(view.costs.budgetRejected, 1);
  assert.equal(view.costs.capacity.maxActiveSessions, 20);
  assert.equal(view.costs.capacity.activeSessions, 4);
  assert.equal(view.costs.capacity.p90ActualTokens, 130000);
});

test('ops model exposes public feedback separately from decision ratings', () => {
  const view = buildOpsViewModel({
    feedback: { feedback: [{ id: 'decision-1', helpfulness: 'helpful' }] },
    publicFeedback: { feedback: [{ id: 'public-1', category: 'bug', message: '按钮点不开' }] },
  });
  assert.equal(view.feedback.length, 1);
  assert.equal(view.publicFeedback.length, 1);
  assert.equal(view.publicFeedback[0].message, '按钮点不开');
});
