import test from 'node:test';
import assert from 'node:assert/strict';

import { clarificationProvenance } from './clarificationProvenance.js';

test('model case analysis admits that deterministic safety questions are merged', () => {
  assert.deepEqual(clarificationProvenance({ plan: { caseAnalysis: { source: 'model' } } }), {
    kind: 'model-with-rule-gate',
    label: '模型补充 · 含规则校验',
    detail: '模型结合本局生成补充项，基础事实仍由规则校验兜底。',
  });
});

test('safety and retained fallbacks never present themselves as model output', () => {
  assert.equal(clarificationProvenance({ plan: { caseAnalysis: { source: 'safety-fallback' } } }).label, '规则安全校验');
  assert.equal(clarificationProvenance({ plan: { caseAnalysis: { source: 'retained-analysis-fallback' } } }).label, '沿用案卷 · 规则保底');
  assert.equal(clarificationProvenance({ fallback: true }).label, '规则安全校验');
});

test('missing source remains visibly unverified', () => {
  assert.equal(clarificationProvenance({}).label, '来源待核验');
});
