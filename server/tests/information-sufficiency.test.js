import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessInformationSufficiency,
  buildQuickInformationFields,
  interpretInformationAnswer,
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
  assert.equal(result.nextQuestion.id, 'body_signal');
  assert.equal(result.readiness.status, 'collecting');
});

test('bare number stays ambiguous when body signal question has no scale', () => {
  const field = buildQuickInformationFields('要不要吃饭')[0];
  const result = interpretInformationAnswer({ field, answer: '2', question: field.prompt });

  assert.equal(result.status, 'ambiguous');
  assert.match(result.followUp, /2.*指|量表|选项/);
  assert.equal(result.normalizedValue, '');
});

test('food intake asks one next question and uses the prior interpretation', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const first = assessInformationSufficiency({ question: '要不要吃饭', answers: [], fields, round: 1 });
  assert.equal(first.nextQuestion.id, 'body_signal');

  const second = assessInformationSufficiency({
    question: '要不要吃饭',
    fields,
    round: 2,
    answers: [{ fieldId: 'body_signal', answer: '只是嘴馋，没有明显饥饿感' }],
  });

  assert.equal(second.nextQuestion.id, 'meal_context');
  assert.equal(second.readiness.status, 'collecting');
  assert.equal(second.fieldStates.find((field) => field.id === 'body_signal').status, 'answered');
});

test('an ambiguous answer is followed up on the same field before dependent questions', () => {
  const fields = buildQuickInformationFields('要不要吃饭');
  const result = assessInformationSufficiency({
    question: '要不要吃饭',
    fields,
    round: 2,
    answers: [{ fieldId: 'body_signal', answer: '2' }],
  });

  assert.equal(result.nextQuestion.id, 'body_signal');
  assert.equal(result.nextQuestion.source, 'rule-gate');
  assert.match(result.nextQuestion.prompt, /2.*指|量表|选项/);
  assert.deepEqual(result.readiness.unresolvedAmbiguities, ['body_signal']);
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
  assert.equal(result.nextQuestion, null);
  assert.equal(result.readiness.status, 'review');
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
  assert.deepEqual(result.readiness.authorizedUnknowns, fields.map((field) => field.id));
  assert.equal(result.readiness.status, 'review');
});
