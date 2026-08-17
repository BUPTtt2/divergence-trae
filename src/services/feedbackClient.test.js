import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFeedbackPayload, submitDecisionFeedback } from './feedbackClient.js';

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
