import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeFeedbackPayload,
  normalizeGeneralFeedback,
  submitDecisionFeedback,
  submitGeneralFeedback,
} from './feedbackClient.js';

test('feedback client trims input, deduplicates tags, and drops unknown tags', () => {
  assert.deepEqual(normalizeFeedbackPayload({
    helpfulness: 'neutral',
    tags: ['too_slow', 'too_slow', 'private_tag'],
    comment: '  等待有点久  ',
  }), { helpfulness: 'neutral', tags: ['too_slow'], comment: '等待有点久' });
});

test('feedback client sends authenticated owner-scoped request', async () => {
  const calls = [];
  const result = await submitDecisionFeedback('session-1', { helpfulness: 'helpful', tags: [], comment: '' }, {
    baseUrl: 'https://api.example',
    token: 'signed-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ feedback: { id: 'f1' } }) };
    },
  });
  assert.equal(result.feedback.id, 'f1');
  assert.equal(calls[0].url, 'https://api.example/api/feedback/session-1');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer signed-token');
});

test('general feedback keeps only public fields and does not attach decision content', () => {
  assert.deepEqual(normalizeGeneralFeedback({
    category: 'bug',
    message: '  手机端按钮点不开  ',
    email: ' USER@EXAMPLE.COM ',
    page: '/sandbox',
    decisionText: 'private',
  }), {
    category: 'bug',
    message: '手机端按钮点不开',
    email: 'user@example.com',
    page: '/sandbox',
  });
});

test('general feedback submits without requiring login and carries idempotency key', async () => {
  const calls = [];
  await submitGeneralFeedback({ category: 'idea', message: '希望增加对比视图', email: '', page: '/' }, {
    baseUrl: 'https://api.example',
    idempotencyKey: 'feedback-once',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ feedback: { id: 'public-f1' } }) };
    },
  });
  assert.equal(calls[0].url, 'https://api.example/api/feedback');
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'feedback-once');
  assert.equal('Authorization' in calls[0].options.headers, false);
});
