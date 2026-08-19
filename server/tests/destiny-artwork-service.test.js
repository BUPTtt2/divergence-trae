import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDestinyArtworkPrompt,
  buildSeedreamRequest,
  generateDestinyArtwork,
  resolveSeedreamModels,
  resolveSeedreamTimeoutMs,
} from '../src/services/destinyArtworkService.js';

test('artwork prompt requests a text-free portrait image from real ticket fields', () => {
  const prompt = buildDestinyArtworkPrompt({
    question: '是否继续推进项目',
    path: { label: '先小范围验证' },
    hexagram: { primary: '风山渐' },
  });
  assert.match(prompt, /风山渐/);
  assert.match(prompt, /先小范围验证/);
  assert.match(prompt, /3:4/);
  assert.match(prompt, /不要任何文字/);
  assert.equal(prompt.includes('undefined'), false);
});

test('seedream request defaults to one economical 1K portrait image without watermark', () => {
  const body = buildSeedreamRequest('model-id', 'prompt');
  assert.deepEqual(body, {
    model: 'model-id',
    prompt: 'prompt',
    size: '1K',
    response_format: 'url',
    watermark: false,
  });
});

test('seedream request accepts an explicit server-side quality setting', () => {
  assert.equal(buildSeedreamRequest('model-id', 'prompt', { size: '2K' }).size, '2K');
});

test('seedream timeout covers measured production latency without exceeding the function budget', () => {
  assert.equal(resolveSeedreamTimeoutMs(), 105000);
  assert.equal(resolveSeedreamTimeoutMs('90000'), 90000);
  assert.equal(resolveSeedreamTimeoutMs('999999'), 110000);
});

test('authorized seedream model chain is ordered and de-duplicated', () => {
  assert.deepEqual(resolveSeedreamModels({
    model: 'seedream-5-pro',
    fallbackModels: 'seedream-5-lite, seedream-4-5, seedream-5-pro, seedream-4-0',
  }), [
    'seedream-5-pro',
    'seedream-5-lite',
    'seedream-4-5',
    'seedream-4-0',
  ]);
});

test('missing server configuration returns an explicit non-blocking fallback', async () => {
  const result = await generateDestinyArtwork({ path: { label: '先验证' } }, {
    apiKey: '',
    model: '',
    fetchImpl: async () => { throw new Error('must not call'); },
  });
  assert.deepEqual(result, { available: false, reason: 'not_configured' });
});

test('returns the first generated image and usage', async () => {
  const result = await generateDestinyArtwork({ path: { label: '先验证' } }, {
    apiKey: 'server-secret',
    model: 'seedream-test',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{ url: 'https://image.test/one.jpg', size: '2048x2732' }], usage: { generated_images: 1 } }),
    }),
  });
  assert.equal(result.available, true);
  assert.equal(result.url, 'https://image.test/one.jpg');
  assert.deepEqual(result.usage, { generated_images: 1 });
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.attempts, [{ model: 'seedream-test', outcome: 'success' }]);
});

test('provider authentication failures stop the chain and are distinguishable from quota errors', async () => {
  const calledModels = [];
  const result = await generateDestinyArtwork({ path: { label: '先验证' } }, {
    apiKey: 'invalid-key',
    model: 'seedream-test',
    fallbackModels: 'seedream-fallback',
    fetchImpl: async (_url, request) => {
      calledModels.push(JSON.parse(request.body).model);
      return { ok: false, status: 401 };
    },
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'authentication_failed');
  assert.equal(result.status, 401);
  assert.deepEqual(calledModels, ['seedream-test']);
});

test('quota and provider failures advance to the next authorized model', async () => {
  const calledModels = [];
  const result = await generateDestinyArtwork({ path: { label: '先验证' } }, {
    apiKey: 'server-secret',
    model: 'seedream-5-pro',
    fallbackModels: ['seedream-5-lite', 'seedream-4-5'],
    fetchImpl: async (_url, request) => {
      const model = JSON.parse(request.body).model;
      calledModels.push(model);
      if (model === 'seedream-5-pro') return { ok: false, status: 429 };
      return {
        ok: true,
        json: async () => ({ model, data: [{ url: 'https://image.test/fallback.jpg' }] }),
      };
    },
  });
  assert.equal(result.available, true);
  assert.equal(result.model, 'seedream-5-lite');
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(calledModels, ['seedream-5-pro', 'seedream-5-lite']);
  assert.deepEqual(result.attempts, [
    { model: 'seedream-5-pro', outcome: 'quota_exceeded', status: 429 },
    { model: 'seedream-5-lite', outcome: 'success' },
  ]);
});

test('non-retryable client errors do not spend fallback quota', async () => {
  let calls = 0;
  const result = await generateDestinyArtwork({}, {
    apiKey: 'server-secret',
    model: 'seedream-5-pro',
    fallbackModels: 'seedream-5-lite',
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 400 };
    },
  });
  assert.equal(result.reason, 'client_error');
  assert.equal(calls, 1);
});
