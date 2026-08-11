import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDestinyArtworkPrompt,
  buildSeedreamRequest,
  generateDestinyArtwork,
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
});
