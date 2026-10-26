/**
 * Langfuse 端到端验证（回归脚本）
 *
 * 链路：callLLM → (mock OpenAI 兼容 provider) → langfuseService 队列
 *       → (mock Langfuse OTel 端点) 断言收到 OTLP/JSON root span + generation span
 *       → (mock Scores API) 断言 score 挂回同一 traceId
 */
import http from 'node:http';
import assert from 'node:assert/strict';

const LLM_PORT = 18742;
const LF_PORT = 18743;

// ---- 1. mock Langfuse OTel + Scores 端点 ----
const otelBatches = [];
const scores = [];
const lfServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (req.url === '/api/public/otel/v1/traces' && Array.isArray(parsed.resourceSpans)) {
        otelBatches.push(parsed);
      } else if (req.url === '/api/public/scores') {
        scores.push(parsed);
      } else {
        assert.fail(`未知端点被调用: ${req.url}`);
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

// 展开 OTLP/JSON：resourceSpans[].scopeSpans[].spans[]
const allSpans = otelBatches.flatMap((b) =>
  b.resourceSpans.flatMap((rs) => rs.scopeSpans.flatMap((ss) => ss.spans))
);
const rootSpans = allSpans.filter((s) => !s.parentSpanId);
const generations = allSpans.filter((s) =>
  (s.attributes || []).some((a) => a.key === 'langfuse.observation.type' && a.value.stringValue === 'generation')
);

const attrOf = (span, key) =>
  (span.attributes || []).find((a) => a.key === key)?.value?.stringValue ?? null;
const attrIntOf = (span, key) => {
  const v = (span.attributes || []).find((a) => a.key === key)?.value?.intValue;
  return v != null ? Number(v) : null;
};

console.log(`收到 spans: total=${allSpans.length} root=${rootSpans.length} generation=${generations.length}, scores=${scores.length}`);
console.log('root span 示例:', JSON.stringify({ name: rootSpans[0]?.name, traceId: rootSpans[0]?.traceId }, null, 2));

assert.ok(rootSpans.length >= 1, '应收到 root span（trace）');
const root = rootSpans.find((s) => s.name === 'llm.e2e-test');
assert.ok(root, 'root span 名应为 llm.e2e-test');

// ID 规范：OTLP 要求 traceId=32 位 hex、spanId=16 位 hex，不符会被 Langfuse 静默丢弃
assert.match(root.traceId, /^[0-9a-f]{32}$/, 'traceId 必须是 32 位 hex');
assert.match(root.spanId, /^[0-9a-f]{16}$/, 'spanId 必须是 16 位 hex');

assert.equal(attrOf(root, 'langfuse.session.id'), 'e2e-session');
assert.equal(attrOf(root, 'langfuse.user.id'), 'e2e-user');
assert.ok(attrOf(root, 'input')?.includes('端到端测试'), 'root span 应包含 input');

assert.ok(generations.length >= 1, '应收到 generation child span');
const gen = generations[0];
assert.equal(gen.traceId, root.traceId, 'generation 应属于同一 trace');
assert.equal(gen.parentSpanId, root.spanId, 'generation 的父 span 应为 root');
assert.equal(attrOf(gen, 'gen_ai.request.model'), 'mock-model');
assert.equal(attrIntOf(gen, 'gen_ai.usage.total_tokens'), 30);
assert.ok(attrOf(gen, 'gen_ai.completion')?.includes('端到端验证回复'), 'generation 应包含 output');

assert.ok(scores.length >= 1, '应收到 score');
assert.equal(scores[0].traceId, root.traceId, 'score 应挂到同一 trace');
assert.equal(scores[0].value, 1);

lfServer.close();
llmServer.close();
console.log('E2E PASS: Langfuse OTel 全链路 trace/generation/score 验证通过');
