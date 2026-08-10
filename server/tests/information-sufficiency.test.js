import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessInformationSufficiency,
  buildQuickInformationFields,
} from '../src/services/informationSufficiency.js';

test('food quick planning asks for three independent decision fields without assuming hunger', () => {
  const fields = buildQuickInformationFields('要不要吃饭');

  assert.deepEqual(fields.map((field) => field.id), [
    'body_signal',
    'meal_context',
    'current_goal',
  ]);
  assert.equal(fields.every((field) => field.required === true), true);
  assert.equal(fields.some((field) => /你现在有明显饥饿感/.test(field.prompt)), false);
});

test('one ambiguous reply does not close every information gap', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const result = assessInformationSufficiency({
    question: '要不要吃饭',
    answers: [{ answer: '不知道，随便' }],
    fields,
    round: 2,
  });

  assert.equal(result.complete, false);
  assert.deepEqual(result.answeredFieldIds, []);
  assert.equal(result.missingFields.length, 3);
});

test('field-specific food answers can reveal a weight-management intent and upgrade depth', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const result = assessInformationSufficiency({
    question: '要不要吃饭',
    answers: [
      { fieldId: 'body_signal', answer: '现在不饿，只是有点嘴馋' },
      { fieldId: 'meal_context', answer: '一小时前刚吃过，而且吃得很多' },
      { fieldId: 'current_goal', answer: '目前正在减脂' },
    ],
    fields,
    round: 2,
  });

  assert.equal(result.complete, true);
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.escalation.changed, true);
  assert.equal(result.escalation.to, 'standard');
  assert.ok(result.intentSignals.includes('weight_management'));
});

test('explicitly skipped fields remain unknown but authorize a conditional quick result', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const result = assessInformationSufficiency({
    question: '要不要吃饭',
    answers: fields.map((field) => ({
      fieldId: field.id,
      answer: '用户选择跳过本项澄清',
    })),
    fields,
    round: 2,
  });

  assert.equal(result.complete, true);
  assert.equal(result.authorizedUnknowns, true);
  assert.equal(result.missingFields.length, 3);
});
