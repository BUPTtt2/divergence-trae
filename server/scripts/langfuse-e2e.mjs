/**
 * Langfuse 端到端验证（临时脚本，验证后删除）
 *
 * 链路：callLLM → (mock OpenAI 兼容 provider) → langfuseService 队列
 *       → (mock Langfuse ingestion server) 断言收到 trace-create / generation-create / score-create
 */
import http from 'node:http';
import assert from 'node:assert/strict';

const LLM_PORT = 18742;
const LF_PORT = 18743;

// ---- 1. mock Langfuse ingestion server ----
const received = [];
const lfServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (req.url === '/api/public/ingestion' && Array.isArray(parsed.batch)) {
        received.push(...parsed.batch);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
});
await new Promise((r) => lfServer.listen(LF_PORT, r));

// ---- 2. mock OpenAI 兼容 provider ----
const llmServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-mock',
      model: 'mock-model',
      choices: [{ index: 0, message: { role: 'assistant', content: '端到端验证回复' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 21, completion_tokens: 9, total_tokens: 30 },
    }));
  });
});
await new Promise((r) => llmServer.listen(LLM_PORT, r));

// ---- 3. 配置环境并导入被测模块 ----
process.env.ARK_API_KEY = 'mock-ark-key';
process.env.ARK_PRIMARY_MODEL = 'mock-model';
process.env.ARK_BASE_URL = `http://127.0.0.1:${LLM_PORT}`;
process.env.LANGFUSE_HOST = `http://127.0.0.1:${LF_PORT}`;
process.env.LANGFUSE_PUBLIC_KEY = 'pk-lf-e2e';
process.env.LANGFUSE_SECRET_KEY = 'sk-lf-e2e';

const { callLLM } = await import('../src/services/llmRouter.js');
const { withLLMUsageContext } = await import('../src/services/llmUsageContext.js');
const { lfScoreSession, isLangfuseEnabled } = await import('../src/services/langfuseService.js');

assert.equal(isLangfuseEnabled(), true, 'Langfuse 应已启用');

// ---- 4. 在 usage context 内跑一次真实 callLLM ----
const answer = await withLLMUsageContext(
  { sessionId: 'e2e-session', userId: 'e2e-user', agentId: 'e2e-agent', stage: 'e2e-test' },
  () => callLLM([{ role: 'user', content: '端到端测试' }], { stage: 'e2e-test', maxTokens: 64 })
);
assert.equal(answer, '端到端验证回复', 'mock provider 应正常返回');

// ---- 5. 用户反馈 score（同一 sessionId） ----
lfScoreSession({ sessionId: 'e2e-session', value: 1, comment: 'e2e 验证' });

// ---- 6. 等待防抖 flush 后断言 ----
await new Promise((r) => setTimeout(r, 1500));

const traces = received.filter((e) => e.type === 'trace-create');
const generations = received.filter((e) => e.type === 'generation-create');
const scores = received.filter((e) => e.type === 'score-create');

console.log(`收到事件: trace=${traces.length} generation=${generations.length} score=${scores.length}`);
console.log('trace body 示例:', JSON.stringify(traces[0]?.body, null, 2).slice(0, 400));
console.log('generation body 示例:', JSON.stringify(generations[0]?.body, null, 2).slice(0, 500));

assert.ok(traces.length >= 1, '应收到 trace-create');
assert.equal(traces[0].body.name, 'llm.e2e-test');
assert.equal(traces[0].body.sessionId, 'e2e-session');
assert.equal(traces[0].body.userId, 'e2e-user');
assert.ok(generations.length >= 1, '应收到 generation-create');
assert.equal(generations[0].body.model, 'mock-model');
assert.equal(generations[0].body.usage.totalTokens, 30);
assert.equal(generations[0].body.output, '端到端验证回复');
assert.ok(scores.length >= 1, '应收到 score-create');
assert.equal(scores[0].body.traceId, traces[0].body.id, 'score 应挂到同一 trace');
assert.equal(scores[0].body.value, 1);

lfServer.close();
llmServer.close();
console.log('E2E PASS: Langfuse 全链路 trace/generation/score 验证通过');
