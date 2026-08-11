import test from 'node:test';
import assert from 'node:assert/strict';
import { callLLM, callLLMStream, callLLMWithTools } from '../src/services/llmRouter.js';
import { providerRuntime } from '../src/services/providerRuntime.js';

function withProviderEnv(run) {
  const before = {
    zhipu: process.env.ZHIPU_API_KEY,
    modelscope: process.env.MODELSCOPE_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    fetch: global.fetch,
  };
  process.env.ZHIPU_API_KEY = 'test-key';
  delete process.env.MODELSCOPE_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  providerRuntime.reset();
  return Promise.resolve(run()).finally(() => {
    if (before.zhipu == null) delete process.env.ZHIPU_API_KEY; else process.env.ZHIPU_API_KEY = before.zhipu;
    if (before.modelscope == null) delete process.env.MODELSCOPE_API_KEY; else process.env.MODELSCOPE_API_KEY = before.modelscope;
    if (before.deepseek == null) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = before.deepseek;
    global.fetch = before.fetch;
    providerRuntime.reset();
  });
}

test('tool calls feed rate limits into the provider circuit', async () => withProviderEnv(async () => {
  global.fetch = async () => new Response('quota details must stay private', { status: 429 });

  await callLLMWithTools({ messages: [{ role: 'user', content: 'test' }], tools: [] });
  await callLLMWithTools({ messages: [{ role: 'user', content: 'test' }], tools: [] });

  assert.equal(providerRuntime.canAttempt('zhipu'), false);
  assert.equal(providerRuntime.entries().filter((entry) => entry.provider === 'zhipu').length, 2);
}));

test('stream fallback events never expose provider response bodies', async () => withProviderEnv(async () => {
  global.fetch = async () => new Response('quota details must stay private', { status: 429 });
  const writes = [];
  const res = {
    setHeader() {}, flushHeaders() {}, end() {},
    write(chunk) { writes.push(chunk); },
  };

  await callLLMStream([{ role: 'user', content: 'test' }], {}, res);

  const output = writes.join('');
  assert.match(output, /event: fallback/);
  assert.doesNotMatch(output, /quota details/);
  assert.equal(providerRuntime.entries().at(-1).error.status, 429);
}));

test('the only configured provider gets a recovery probe while its circuit is open', async () => withProviderEnv(async () => {
  global.fetch = async () => new Response('rate limited', { status: 429 });
  await callLLM([{ role: 'user', content: 'first' }]);
  await callLLM([{ role: 'user', content: 'second' }]);
  assert.equal(providerRuntime.canAttempt('zhipu'), false);

  global.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '恢复成功' } }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  assert.equal(await callLLM([{ role: 'user', content: 'probe' }]), '恢复成功');
  assert.equal(providerRuntime.canAttempt('zhipu'), true);
}));
