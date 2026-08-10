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

test('其他提供商不注入智谱专属 thinking 参数', () => {
  const body = buildProviderRequestBody(
    { name: 'deepseek', model: 'deepseek-chat' },
    [{ role: 'user', content: '只回复结论' }],
    {},
  );

  assert.equal('thinking' in body, false);
});
