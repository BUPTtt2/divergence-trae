/**
 * llmTraceContext —— 推演链路可观测性中间件
 *
 * 作用：把一次推演会话的 sessionId/userId/stage 注入 AsyncLocalStorage，
 *       使该请求内所有 callLLM 调用产生的 Langfuse trace 共享同一
 *       langfuse.session.id（在 Langfuse UI 中串成一条会话链），
 *       且 trace 名自动带阶段（llm.analyze / llm.dialogue / llm.summary ...）。
 *
 * sessionId 来源优先级：
 *   1. 请求头 x-trace-session（前端 apiClient 统一注入）
 *   2. body/query 里的 sessionId
 * stage 来源：按路径映射推导（无需业务代码逐个传）。
 *
 * 必须挂在 express.json() 之后（要读 req.body）。
 */
import { withLLMUsageContext } from '../services/llmUsageContext.js';

const STAGE_MAP = [
  [/\/agent\/analyze/, 'analyze'],
  [/\/agent\/dialogue/, 'dialogue'],
  [/\/agent\/summary/, 'summary'],
  [/\/agent\/question/, 'agent.question'],
  [/\/agent\/session/, 'session.chat'],
  [/\/yan\/chat/, 'yan.chat'],
  [/\/divination\/interpret/, 'divination.interpret'],
  [/\/divination\/cast/, 'divination.cast'],
  [/\/divination\//, 'divination'],
  [/\/deliberation/, 'deliberation'],
  [/\/daily/, 'daily'],
];

function resolveStage(url) {
  const hit = STAGE_MAP.find(([re]) => re.test(url || ''));
  return hit ? hit[1] : null;
}

export function llmTraceContext(req, res, next) {
  const raw = req.get?.('x-trace-session') || req.body?.sessionId || req.body?.conversationId || req.query?.sessionId || null;
  const sessionId = raw ? String(raw).replace(/[^\w:-]/g, '').slice(0, 64) || null : null;
  const userId = req.userId ? String(req.userId) : null;
  const stage = resolveStage(req.originalUrl || req.url);
  withLLMUsageContext({ sessionId, userId, ...(stage ? { stage } : {}) }, () => next());
}

export default llmTraceContext;
