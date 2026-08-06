/**
 * AgentRunner —— 唯一的 Agent 调用入口。
 *   外部模块（planner / deliberationEngine）不要直接 new OrchestratorAgent().run(ctx)，
 *   必须走 AgentRunner.run(agent, {sessionId, userId, round, blackboard})。
 *
 * 负责：
 *   1) correlationId 生成（hash(sessionId|agent.id|round|ts)，唯一可追溯）
 *   2) 超时控制（AbortController）—— 走 BaseAgent.timeoutMs，不再散着写 withTimeout 3 版
 *   3) 重试（按 BaseAgent.retries，默认 1 次）—— 复用 retryHelper.withRetry/withTimeout
 *   4) 熔断：同一 agent 5 分钟内 3 次失败，熔断 2 分钟，拒绝调用（抛 CIRCUIT_OPEN 错误）
 *   5) 幂等缓存：同一 correlationId 跑过一次，缓存成功输出，不重复花 token
 *   6) eventStore：每次开始/成功/失败都 append AGENT_RUN 事件
 */
import crypto from 'node:crypto';
import eventStore from '../services/eventStore.js';
import logger from '../services/logger.js';
import { withRetry, withTimeout } from '../services/retryHelper.js';
import BaseAgent from './BaseAgent.js';

const FAIL_WINDOW_MS = 5 * 60 * 1000;
const FAIL_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 2 * 60 * 1000;

const failureLog = new Map();     // agentId -> [ts, ts, ts]
const circuitOpen = new Map();    // agentId -> openUntilTs
const idempotencyCache = new Map();  // correlationId -> {ok, output, meta, expiresTs}
const IDEMPOTENCY_TTL = 10 * 60 * 1000;

function _correlationId(parts) {
  const s = parts.map(p => String(p ?? '_')).join('|');
  return 'cid_' + crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

function _isCircuitOpen(agentId, now = Date.now()) {
  const until = circuitOpen.get(agentId);
  if (until && until > now) return true;
  if (until) circuitOpen.delete(agentId);
  const fails = (failureLog.get(agentId) || []).filter(ts => ts > now - FAIL_WINDOW_MS);
  failureLog.set(agentId, fails);
  if (fails.length >= FAIL_THRESHOLD) {
    const reopen = now + CIRCUIT_OPEN_MS;
    circuitOpen.set(agentId, reopen);
    logger.warn(`[AgentRunner] 熔断 ${agentId} 开启，5min 内 ${fails.length} 次失败，熔断至 ${new Date(reopen).toISOString()}`);
    return true;
  }
  return false;
}
function _recordFail(agentId) {
  const now = Date.now();
  const arr = failureLog.get(agentId) || [];
  arr.push(now);
  failureLog.set(agentId, arr.slice(-10));
}
function _recordSuccess(agentId) {
  failureLog.delete(agentId);
  circuitOpen.delete(agentId);
}

/**
 * @param {BaseAgent} agent
 * @param {{sessionId:string, userId:string, round?:number, blackboard?:Record<string,any>}} baseCtx
 * @returns {Promise<{ok:boolean, output:any, meta:any, correlationId:string}>}
 */
export async function run(agent, baseCtx) {
  if (!(agent instanceof BaseAgent)) {
    throw new Error('[AgentRunner] first arg must be a BaseAgent instance');
  }
  if (!baseCtx || !baseCtx.sessionId || !baseCtx.userId) {
    throw new Error('[AgentRunner] sessionId and userId are required in baseCtx');
  }
  const round = typeof baseCtx.round === 'number' ? baseCtx.round : 0;
  const now = Date.now();
  const correlationId = _correlationId([baseCtx.sessionId, agent.id, round, now]);

  // 1) 幂等缓存
  const cached = idempotencyCache.get(correlationId);
  if (cached && cached.expiresTs > now) {
    eventStore.append({ type: 'AGENT_RUN_CACHE_HIT', agentId: agent.id, sessionId: baseCtx.sessionId, correlationId, ts: now });
    return { ok: true, output: cached.output, meta: { ...cached.meta, cacheHit: true }, correlationId };
  }

  // 2) 熔断
  if (_isCircuitOpen(agent.id, now)) {
    const err = Object.assign(new Error(`[AgentRunner] ${agent.id} 熔断中，拒绝调用`), { type: 'CIRCUIT_OPEN' });
    eventStore.append({ type: 'AGENT_RUN_CIRCUIT_OPEN', agentId: agent.id, sessionId: baseCtx.sessionId, correlationId, ts: now });
    throw err;
  }

  // 3) sessionCtx + AbortController
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), agent.timeoutMs);
  const sessionCtx = {
    sessionId: baseCtx.sessionId,
    userId: baseCtx.userId,
    round,
    correlationId,
    signal: controller.signal,
    blackboard: { ...(baseCtx.blackboard || {}) }
  };

  eventStore.append({ type: 'AGENT_RUN_START', agentId: agent.id, sessionId: baseCtx.sessionId, correlationId, timeoutMs: agent.timeoutMs, retries: agent.retries, ts: now });

  let result;
  try {
    const wrapped = () => withTimeout(async () => agent.run(sessionCtx), agent.timeoutMs, `Agent:${agent.id}`);
    result = agent.retries > 0
      ? await withRetry(wrapped, { retries: agent.retries, delayMs: 600, backoffMs: 1200, name: `Agent:${agent.id}` })
      : await wrapped();
    clearTimeout(timeoutHandle);
    _recordSuccess(agent.id);
    if (result.ok) {
      idempotencyCache.set(correlationId, { output: result.output, meta: result.meta, expiresTs: Date.now() + IDEMPOTENCY_TTL });
    }
    eventStore.append({ type: 'AGENT_RUN_OK', agentId: agent.id, sessionId: baseCtx.sessionId, correlationId, latencyMs: result.meta?.latencyMs, ts: Date.now() });
    return { ...result, correlationId };
  } catch (err) {
    clearTimeout(timeoutHandle);
    _recordFail(agent.id);
    eventStore.append({
      type: 'AGENT_RUN_FAIL',
      agentId: agent.id,
      sessionId: baseCtx.sessionId,
      correlationId,
      errType: err?.type || String(err?.name || 'Error'),
      errMsg: (err?.message || String(err)).slice(0, 200),
      ts: Date.now()
    });
    logger.error(`[AgentRunner] ${agent.id} 失败: ${err?.type || ''} ${err?.message || err}`);
    throw err;
  }
}

export default { run };
