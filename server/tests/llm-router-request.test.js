import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProviderRequestBody } from '../src/services/llmRouter.js';

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

test('Doubao streaming requests ask Ark to return final token usage', () => {
  const body = buildProviderRequestBody(
    { name: 'doubao', model: 'ep-competition-model' },
    [{ role: 'user', content: '给出判断' }],
    { stream: true },
  );

  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
});
