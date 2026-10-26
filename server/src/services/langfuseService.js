import { getLLMUsageContext } from './llmUsageContext.js';

/**
 * Langfuse LLM 可观测性接入（OTel 轻量客户端）
 *
 * 设计原则：
 * 1. 零新依赖 —— 直接调用 Langfuse OTLP/JSON 端点 + Scores REST API，Node 18+ 原生 fetch
 *    （注意：旧版 /api/public/ingestion 已被 Langfuse Cloud 废弃，会静默丢弃数据，勿用！）
 * 2. 永不阻塞主流程 —— 所有上报 fire-and-forget，异常只 console.warn，绝不抛出
 * 3. 未配置即关闭 —— 缺少 LANGFUSE_PUBLIC_KEY/SECRET_KEY 时全部为 no-op，本地开发零成本
 * 4. Serverless 友好 —— 按 trace 分组缓冲 + 800ms 防抖 + 每次逻辑调用结束主动 flush
 *
 * 环境变量：
 *   LANGFUSE_HOST        默认 https://cloud.langfuse.com（自部署填自己域名）
 *   LANGFUSE_PUBLIC_KEY  pk-lf-...
 *   LANGFUSE_SECRET_KEY  sk-lf-...
 *   LANGFUSE_ENABLED     设为 'false' 强制关闭（即使配了 key）
 *
 * 数据模型（OTel 映射）：
 *   root span     —— 一次逻辑 LLM 调用 = Langfuse trace（agent 发言 / 演总结 / 演对话 / 工具循环）
 *   child span    —— 单个提供商的一次真实调用（langfuse.observation.type=generation）
 *   score (REST)  —— 用户反馈（点赞/点踩）挂到对应 trace，trace 成功上报后再发送
 */

const HOST = (process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com').replace(/\/$/, '');
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || '';
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || '';
const ENABLED = process.env.LANGFUSE_ENABLED !== 'false' && Boolean(PUBLIC_KEY && SECRET_KEY);

const MAX_TEXT_CHARS = 4000;   // 单字段序列化后截断上限，防止超大 prompt 拖慢上报
const FLUSH_DEBOUNCE_MS = 800; // 防抖窗口
const MAX_PENDING_TRACES = 100; // 缓冲 trace 组上限，超过立即 flush

// traceId(32hex) -> { rootSpan, spans: [], scores: [] }
const pending = new Map();
let flushTimer = null;

// 会话/用户 → 最近 traceId（Langfuse hex 形式），用于把用户反馈(score)挂回对应 trace
const recentTraceBySession = new Map();
const recentTraceByUser = new Map();
const RECENT_CAP = 500;

function uuid() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}
/** Langfuse OTel 要求：traceId=32位hex, spanId=16位hex（长度不符会被静默丢弃） */
function hexTraceId() {
  return (uuid().replaceAll('-', '') + uuid().replaceAll('-', '')).slice(0, 32);
}
function hexSpanId() { return uuid().replaceAll('-', '').slice(0, 16); }
function nowIso() { return new Date().toISOString(); }
function nanoNow() { return (BigInt(Date.now()) * 1000000n).toString(); }
function nanoAgo(ms) { return (BigInt(Date.now() - Math.max(0, ms || 0)) * 1000000n).toString(); }

/** 序列化并截断，保证任何输入都能安全进 payload */
function clip(value) {
  if (value === null || value === undefined) return value;
  try {
    if (typeof value === 'string') {
      return value.length > MAX_TEXT_CHARS ? `${value.slice(0, MAX_TEXT_CHARS)}…[截断]` : value;
    }
    const text = JSON.stringify(value);
    if (text === undefined) return String(value);
    if (text.length <= MAX_TEXT_CHARS) return value;
    return `${text.slice(0, MAX_TEXT_CHARS)}…[截断]`;
  } catch {
    return String(value).slice(0, MAX_TEXT_CHARS);
  }
}

function attr(key, stringValue) {
  return { key, value: { stringValue: String(stringValue) } };
}
function attrInt(key, intValue) {
  return { key, value: { intValue: String(intValue) } };
}

function rememberRecentTrace(sessionId, userId, traceId) {
  if (sessionId) {
    recentTraceBySession.set(sessionId, traceId);
    if (recentTraceBySession.size > RECENT_CAP) {
      recentTraceBySession.delete(recentTraceBySession.keys().next().value);
    }
  }
  if (userId) {
    recentTraceByUser.set(userId, traceId);
    if (recentTraceByUser.size > RECENT_CAP) {
      recentTraceByUser.delete(recentTraceByUser.keys().next().value);
    }
  }
}

async function postJson(path, payload) {
  const auth = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(`${HOST}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const bodyText = await resp.text().catch(() => '');
    if (!resp.ok || /error|partial|rejected|invalid/i.test(bodyText.slice(0, 500))) {
      console.warn(`[Langfuse] ${path} 响应异常 status=${resp.status} body=${bodyText.slice(0, 800)}`);
      return false;
    }
    if (bodyText && bodyText !== '{}' && process.env.LANGFUSE_DEBUG === 'true') {
      console.log(`[Langfuse][debug] ${path} status=${resp.status} body=${bodyText.slice(0, 800)}`);
    }
    return true;
  } catch (e) {
    console.warn(`[Langfuse] ${path} 上报失败（不影响主流程）: ${e?.message || e}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 构建 OTLP/JSON span（Langfuse otel/v1/traces 端点格式） */
function buildSpan({ traceIdHex, spanIdHex, parentSpanIdHex, name, startTimeNano, endTimeNano, attributes }) {
  const span = {
    traceId: traceIdHex,
    spanId: spanIdHex,
    name,
    kind: 'SPAN_KIND_INTERNAL',
    startTimeUnixNano: startTimeNano,
    endTimeUnixNano: endTimeNano || nanoNow(),
    attributes,
  };
  if (parentSpanIdHex) span.parentSpanId = parentSpanIdHex;
  return span;
}

/**
 * 创建一条逻辑 LLM 调用的 trace（root span）
 * @returns {string|null} traceId（未启用时返回 null，调用方无需判断即可继续传）
 */
export function lfTrace({ name, sessionId, userId, agentId, stage, metadata = {}, input } = {}) {
  if (!ENABLED) return null;
  try {
    const active = getLLMUsageContext();
    const mergedSession = sessionId || active.sessionId || null;
    const mergedUser = userId || active.userId || null;
    const traceIdHex = hexTraceId();
    const rootSpanId = hexSpanId();
    const startNano = nanoNow();

    const attrs = [
      attr('langfuse.session.id', mergedSession || 'unknown'),
      attr('langfuse.user.id', mergedUser || 'unknown'),
      attr('langfuse.metadata', JSON.stringify(clip({
        ...metadata,
        agentId: agentId || active.agentId || null,
        stage: stage || active.stage || null,
      })) || '{}'),
      { key: 'langfuse.tags', value: { arrayValue: { values: [{ stringValue: 'yance' }, { stringValue: 'production' }] } } },
    ];
    if (input !== undefined && input !== null) attrs.push(attr('input', JSON.stringify(clip(input))));

    const rootSpan = buildSpan({
      traceIdHex,
      spanIdHex: rootSpanId,
      name: name || `llm.${stage || active.stage || 'call'}`,
      startTimeNano: startNano,
      attributes: attrs,
    });

    pending.set(traceIdHex, { rootSpan, spans: [], scores: [] });
    rememberRecentTrace(mergedSession, mergedUser, traceIdHex);

    if (pending.size >= MAX_PENDING_TRACES) flushLangfuse();
    else scheduleFlush();
    return traceIdHex;
  } catch (e) {
    console.warn(`[Langfuse] trace 创建失败: ${e?.message || e}`);
    return null;
  }
}

/**
 * 记录一次真实的模型调用（generation = trace 下的 child span）
 * traceId 为 null（未启用）时自动 no-op
 */
export function lfGeneration({
  traceId,
  name,
  provider,
  model,
  input,
  output,
  usage,
  latencyMs,
  level = 'DEBUG',
  statusMessage,
  metadata = {},
} = {}) {
  if (!ENABLED || !traceId) return;
  try {
    const group = pending.get(traceId);
    if (!group) return; // trace 未在本进程缓冲中（已 flush），跳过避免孤儿 span
    const startNano = nanoAgo(latencyMs || 0);
    const attrs = [
      attr('langfuse.observation.type', 'generation'),
      attr('langfuse.observation.level', level),
      attr('gen_ai.system', provider || 'unknown'),
      attr('gen_ai.request.model', model || provider || 'unknown'),
    ];
    if (input !== undefined && input !== null) attrs.push(attr('gen_ai.prompt', JSON.stringify(clip(input))));
    if (output !== undefined && output !== null) attrs.push(attr('gen_ai.completion', JSON.stringify(clip(output))));
    if (usage) {
      if (usage.prompt_tokens != null) attrs.push(attrInt('gen_ai.usage.prompt_tokens', usage.prompt_tokens));
      if (usage.completion_tokens != null) attrs.push(attrInt('gen_ai.usage.completion_tokens', usage.completion_tokens));
      if (usage.total_tokens != null) attrs.push(attrInt('gen_ai.usage.total_tokens', usage.total_tokens));
    }
    if (metadata && Object.keys(metadata).length > 0) {
      attrs.push(attr('langfuse.metadata', JSON.stringify(clip({ ...metadata, latencyMs: latencyMs || null }))));
    }
    if (statusMessage) attrs.push(attr('langfuse.observation.status_message', String(statusMessage).slice(0, 500)));

    group.spans.push(buildSpan({
      traceIdHex: traceId,
      spanIdHex: hexSpanId(),
      parentSpanIdHex: group.rootSpan.spanId,
      name: name || `${provider || 'llm'}.generation`,
      startTimeNano: startNano,
      attributes: attrs,
    }));
  } catch (e) {
    console.warn(`[Langfuse] generation 记录失败: ${e?.message || e}`);
  }
}

/**
 * 把用户反馈作为 score 挂到该会话/用户最近的 trace 上
 * score 会在 trace 上报成功后随组发送（Langfuse 要求 trace 先存在）
 * 找不到对应 trace 时静默跳过（LLM 调用可能早于本进程生命周期）
 */
export function lfScoreSession({ sessionId, userId, name = 'user-feedback', value = 0, comment } = {}) {
  if (!ENABLED) return;
  try {
    const traceId = (sessionId && recentTraceBySession.get(sessionId))
      || (userId && recentTraceByUser.get(userId))
      || null;
    if (!traceId) return;
    const group = pending.get(traceId);
    if (group) {
      group.scores.push({
        traceId,
        name,
        value: Number(value) || 0,
        dataType: 'NUMERIC',
        comment: comment ? String(comment).slice(0, 800) : undefined,
      });
    } else {
      // trace 已 flush：直接走 Scores REST API（最终一致性下偶尔 404 可接受）
      postJson('/api/public/scores', {
        traceId,
        name,
        value: Number(value) || 0,
        dataType: 'NUMERIC',
        comment: comment ? String(comment).slice(0, 800) : undefined,
      });
    }
    // 返回 flush promise，serverless 环境下调用方应 await（响应后函数会被冻结）
    return flushLangfuse();
  } catch (e) {
    console.warn(`[Langfuse] score 记录失败: ${e?.message || e}`);
  }
}

/** 立即上报所有缓冲的 trace + score（fire-and-forget，5s 超时，失败仅告警） */
export async function flushLangfuse() {
  if (!ENABLED || pending.size === 0) return;
  const groups = Array.from(pending.entries());
  pending.clear();
  await Promise.all(groups.map(async ([traceIdHex, group]) => {
    const ok = await postJson('/api/public/otel/v1/traces', {
      resourceSpans: [{
        resource: { attributes: [attr('service.name', 'yance-backend')] },
        scopeSpans: [{
          scope: { name: 'yance-langfuse-service', version: '1.0.0' },
          spans: [group.rootSpan, ...group.spans],
        }],
      }],
    });
    if (ok && group.scores.length > 0) {
      await Promise.all(group.scores.map((s) => postJson('/api/public/scores', s)));
    }
  }));
}

function scheduleFlush() {
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLangfuse();
    }, FLUSH_DEBOUNCE_MS);
    // Node 环境下不阻止进程退出
    flushTimer.unref?.();
  }
}

export function isLangfuseEnabled() {
  return ENABLED;
}

export default { lfTrace, lfGeneration, lfScoreSession, flushLangfuse, isLangfuseEnabled };
