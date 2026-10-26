import { getLLMUsageContext } from './llmUsageContext.js';

/**
 * Langfuse LLM 可观测性接入（轻量 Ingestion 客户端）
 *
 * 设计原则：
 * 1. 零新依赖 —— 直接调用 Langfuse Ingestion API（Basic Auth + batch），Node 18+ 原生 fetch
 * 2. 永不阻塞主流程 —— 所有上报 fire-and-forget，异常只 console.warn，绝不抛出
 * 3. 未配置即关闭 —— 缺少 LANGFUSE_PUBLIC_KEY/SECRET_KEY 时全部为 no-op，本地开发零成本
 * 4. Serverless 友好 —— 批量队列 + 800ms 防抖 + 每条 LLM 调用结束主动 flush
 *
 * 环境变量：
 *   LANGFUSE_HOST        默认 https://cloud.langfuse.com（自部署填自己域名）
 *   LANGFUSE_PUBLIC_KEY  pk-lf-...
 *   LANGFUSE_SECRET_KEY  sk-lf-...
 *   LANGFUSE_ENABLED     设为 'false' 强制关闭（即使配了 key）
 *
 * 数据模型（与 Langfuse 概念对应）：
 *   trace        —— 一次逻辑 LLM 调用（agent 发言 / 演总结 / 演对话 / 工具循环）
 *   generation   —— 单个提供商的一次真实调用（含 fallback 链上每次尝试）
 *   score        —— 用户反馈（点赞/点踩）回写到对应会话最近的 trace
 */

const HOST = (process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com').replace(/\/$/, '');
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || '';
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || '';
const ENABLED = process.env.LANGFUSE_ENABLED !== 'false' && Boolean(PUBLIC_KEY && SECRET_KEY);

const MAX_TEXT_CHARS = 4000;   // 单字段序列化后截断上限，防止超大 prompt 拖慢上报
const FLUSH_DEBOUNCE_MS = 800; // 防抖窗口
const MAX_QUEUE = 200;         // 队列上限，超过立即 flush
const RECENT_CAP = 500;        // sessionId→traceId 记忆容量

const queue = [];
let flushTimer = null;

// 会话 → 最近 traceId 映射，用于把用户反馈(score)挂回对应 trace
const recentTraceBySession = new Map();
const recentTraceByUser = new Map();

function uuid() {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function nowIso() {
  return new Date().toISOString();
}

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

function enqueue(event) {
  if (!ENABLED) return;
  queue.push(event);
  if (queue.length >= MAX_QUEUE) {
    flushLangfuse();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLangfuse();
    }, FLUSH_DEBOUNCE_MS);
    // Node 环境下不阻止进程退出
    flushTimer.unref?.();
  }
}

/** 立即上报队列中所有事件（fire-and-forget，4s 超时，失败仅告警） */
export async function flushLangfuse() {
  if (!ENABLED || queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    const auth = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`${HOST}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ batch }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) {
      console.warn(`[Langfuse] ingestion 响应异常 status=${resp.status}`);
    }
  } catch (e) {
    console.warn(`[Langfuse] ingestion 失败（不影响主流程）: ${e?.message || e}`);
  }
}

/**
 * 创建一条 trace（一次逻辑 LLM 调用）
 * @returns {string|null} traceId（未启用时返回 null，调用方无需判断即可继续传）
 */
export function lfTrace({ name, sessionId, userId, agentId, stage, metadata = {}, input } = {}) {
  if (!ENABLED) return null;
  try {
    const active = getLLMUsageContext();
    const traceId = uuid();
    const timestamp = nowIso();
    const mergedSession = sessionId || active.sessionId || null;
    const mergedUser = userId || active.userId || null;
    rememberRecentTrace(mergedSession, mergedUser, traceId);
    enqueue({
      type: 'trace-create',
      id: uuid(),
      timestamp,
      body: {
        id: traceId,
        timestamp,
        name: name || `llm.${stage || active.stage || 'call'}`,
        sessionId: mergedSession,
        userId: mergedUser,
        metadata: clip({ ...metadata, agentId: agentId || active.agentId || null, stage: stage || active.stage || null }),
        tags: ['yance', 'production'],
        input: clip(input),
      },
    });
    return traceId;
  } catch (e) {
    console.warn(`[Langfuse] trace 创建失败: ${e?.message || e}`);
    return null;
  }
}

/**
 * 记录一次真实的模型调用（generation）
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
    const timestamp = nowIso();
    const startTime = new Date(Date.now() - Math.max(0, latencyMs || 0)).toISOString();
    enqueue({
      type: 'generation-create',
      id: uuid(),
      timestamp,
      body: {
        id: uuid(),
        traceId,
        name: name || `${provider || 'llm'}.generation`,
        startTime,
        endTime: timestamp,
        model: model || provider || 'unknown',
        modelParameters: { provider: provider || null },
        input: clip(input),
        output: clip(output),
        usage: usage ? {
          promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? null,
          completionTokens: usage.completion_tokens ?? usage.completionTokens ?? null,
          totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
        } : null,
        metadata: clip({ ...metadata, latencyMs: latencyMs || null }),
        level,
        statusMessage: statusMessage ? String(statusMessage).slice(0, 500) : undefined,
      },
    });
  } catch (e) {
    console.warn(`[Langfuse] generation 记录失败: ${e?.message || e}`);
  }
}

/**
 * 把用户反馈作为 score 挂到该会话/用户最近的 trace 上
 * 找不到对应 trace 时静默跳过（LLM 调用可能早于本进程生命周期）
 */
export function lfScoreSession({ sessionId, userId, name = 'user-feedback', value = 0, comment } = {}) {
  if (!ENABLED) return;
  try {
    const traceId = (sessionId && recentTraceBySession.get(sessionId))
      || (userId && recentTraceByUser.get(userId))
      || null;
    if (!traceId) return;
    const timestamp = nowIso();
    enqueue({
      type: 'score-create',
      id: uuid(),
      timestamp,
      body: {
        id: uuid(),
        traceId,
        name,
        value: Number(value) || 0,
        comment: comment ? String(comment).slice(0, 800) : undefined,
      },
    });
    flushLangfuse();
  } catch (e) {
    console.warn(`[Langfuse] score 记录失败: ${e?.message || e}`);
  }
}

export function isLangfuseEnabled() {
  return ENABLED;
}

export default { lfTrace, lfGeneration, lfScoreSession, flushLangfuse, isLangfuseEnabled };
