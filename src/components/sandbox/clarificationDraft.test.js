import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clarificationDraftComplete,
  createClarificationDraft,
  serializeClarificationAnswers,
} from './clarificationDraft.js';

const questions = [
  { fieldId: 'body_signal', question: '你现在是什么身体感受？', required: true },
  { fieldId: 'meal_context', question: '上一餐是什么时候？', required: true },
  { fieldId: 'current_goal', question: '你现在的主要目标是什么？', required: true },
];

test('clarification draft keeps one answer per information field', () => {
  assert.deepEqual(createClarificationDraft(questions), {
    body_signal: '',
    meal_context: '',
    current_goal: '',
  });
});

test('clarification answers serialize without copying one reply into every field', () => {
  const draft = {
    body_signal: '不饿，只是嘴馋',
    meal_context: '一小时前刚吃过很多',
    current_goal: '正在减脂',
  };

  assert.deepEqual(serializeClarificationAnswers(draft, questions), [
    { fieldId: 'body_signal', question: questions[0].question, answer: draft.body_signal },
    { fieldId: 'meal_context', question: questions[1].question, answer: draft.meal_context },
    { fieldId: 'current_goal', question: questions[2].question, answer: draft.current_goal },
  ]);
});

test('required clarification fields accept an explicit skip but reject empty input', () => {
  assert.equal(clarificationDraftComplete({ body_signal: '', meal_context: '', current_goal: '' }, questions), false);
  assert.equal(clarificationDraftComplete({
    body_signal: '暂不回答',
    meal_context: '一小时前吃过',
    current_goal: '保持规律',
  }, questions), true);
});
