import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProviderRequestBody, getConfiguredProviders } from '../src/services/llmRouter.js';

test('智谱 GLM-4.7 Flash 默认关闭思考，避免短输出预算被推理占满', () => {
  const body = buildProviderRequestBody(
    { name: 'zhipu', model: 'glm-4.7-flash' },
    [{ role: 'user', content: '只回复结论' }],
    { maxTokens: 128, temperature: 0 },
  );

  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.max_tokens, 128);
});

test('DeepSeek V4 routine calls explicitly disable thinking', () => {
  const body = buildProviderRequestBody(
    { name: 'deepseek', model: 'deepseek-v4-flash' },
    [{ role: 'user', content: '只回复结论' }],
    {},
  );

  assert.deepEqual(body.thinking, { type: 'disabled' });
});

test('complex synthesis can enable DeepSeek thinking explicitly', () => {
  const body = buildProviderRequestBody(
    { name: 'deepseek', model: 'deepseek-v4-flash' },
    [{ role: 'user', content: '审查冲突' }],
    { thinking: true },
  );

  assert.deepEqual(body.thinking, { type: 'enabled' });
});

test('Ark GLM fallback disables hidden reasoning for routine calls', () => {
  const body = buildProviderRequestBody(
    { name: 'ark-fallback-1', kind: 'ark', model: 'glm-5-2-260617' },
    [{ role: 'user', content: '只回复结论' }],
    {},
  );
  assert.deepEqual(body.thinking, { type: 'disabled' });
});

test('Doubao streaming requests ask Ark to return final token usage', () => {
  const body = buildProviderRequestBody(
    { name: 'doubao', model: 'ep-competition-model' },
    [{ role: 'user', content: '给出判断' }],
    { stream: true },
  );

  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
});

test('ark models are ordered primary then unique fallbacks with isolated circuits', () => {
  const keys = ['ARK_API_KEY', 'ARK_PRIMARY_MODEL', 'ARK_FALLBACK_MODELS', 'ARK_ENDPOINT_ID', 'DOUBAO_MODEL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.ARK_API_KEY = 'server-secret';
  process.env.ARK_PRIMARY_MODEL = 'deepseek-v4-flash-ga-260731';
  process.env.ARK_FALLBACK_MODELS = 'glm-5-2-260617, deepseek-v4-flash-ga-260731';
  delete process.env.ARK_ENDPOINT_ID;
  delete process.env.DOUBAO_MODEL;
  try {
    const providers = getConfiguredProviders().filter((item) => item.kind === 'ark');
    assert.deepEqual(providers.map((item) => item.model), ['deepseek-v4-flash-ga-260731', 'glm-5-2-260617']);
    assert.deepEqual(providers.map((item) => item.name), ['ark-primary', 'ark-fallback-1']);
  } finally {
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
