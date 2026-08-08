﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * 后端 API 封装模块
 * 统一管理所有后端接口调用，包含 SSE 流式处理
 *
 * 鉴权：JWT Bearer Token（access + refresh）
 * - 请求自动注入 Authorization: Bearer <accessToken>
 * - access token 即将过期时自动刷新
 * - 401 响应时尝试 refresh 并重试一次
 * - 后端不可达时降级（让上层用 localStorage 兜底）
 */

// 使用 baseConfig 打破循环依赖 - 完全不依赖 auth.js
import {
  API_BASE_URL,
  getAccessTokenSync,
  getRefreshTokenSync,
  getCurrentUserIdSync,
  isTokenExpiringSoonSync,
  storageRemove,
  TOKEN_KEYS,
} from './baseConfig.js';
import { shouldAttemptTokenRefresh } from './apiAuthPolicy.js';

const PRIMARY_API = API_BASE_URL;
const FALLBACK_API = PRIMARY_API;

let _activeApi = PRIMARY_API;
const CIRCUIT_KEY = 'cyber_yan_api_circuit_until';
let _apiUnavailableUntil = 0;
(function _restoreCircuitFromStorage() {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(CIRCUIT_KEY);
      if (raw) {
        const ts = parseInt(raw, 10);
        if (!Number.isNaN(ts) && ts > Date.now()) _apiUnavailableUntil = ts;
      }
    }
  } catch (_) {}
})();

class ApiUnavailableError extends Error {
  constructor(msg = '后端暂不可用，已静默降级本地模式') {
    super(msg);
    this.name = 'ApiUnavailableError';
    this.silent = true;
  }
}

const BACKOFF_MS = 30 * 1000; // 30 秒（原 3 分钟太长，国内访问 Vercel 偶尔超时就会断 3 分钟）

function isBackendCircuitOpen() {
  return Date.now() < _apiUnavailableUntil;
}
function tripBackendCircuit(reason = '') {
  if (!isBackendCircuitOpen()) {
    _apiUnavailableUntil = Date.now() + BACKOFF_MS;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CIRCUIT_KEY, String(_apiUnavailableUntil));
        if (window.__circuitTripped !== true) {
          window.__circuitTripped = true;
          console.info(`⚡ [赛博推演台] 后端暂不可连 → 启动本地沙盘模式（${Math.round(BACKOFF_MS/60000)} 分钟内不再重试）${reason ? ' · ' + reason : ''}`);
        }
      }
    } catch (_) {}
  }
}
function resetBackendCircuit() {
  _apiUnavailableUntil = 0;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CIRCUIT_KEY);
      window.__circuitTripped = false;
    }
  } catch (_) {}
}

// 内联实现 refreshAccessToken，不依赖 auth.js
async function refreshAccessToken() {
  const refreshToken = getRefreshTokenSync();
  const curUserId = typeof window !== 'undefined' ? getCurrentUserIdSync() : null;
  if (!shouldAttemptTokenRefresh({ refreshToken, userId: curUserId })) return null;

  try {
    const resp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const data = await resp.json();
    if (data.accessToken) {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, data.accessToken);
        if (data.refreshToken) window.localStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, data.refreshToken);
        if (data.expiresIn) {
          const expiresAt = Date.now() + data.expiresIn * 1000 - 30 * 1000;
          window.localStorage.setItem(TOKEN_KEYS.TOKEN_EXPIRY, String(expiresAt));
        }
      }
      return data.accessToken;
    }
    throw new Error('响应缺少 accessToken');
  } catch (e) {
    if (typeof window !== 'undefined') {
      const log = window.__circuitTripped ? console.debug : console.info;
      log('[apiClient] token refresh skipped / failed:', e?.message || 'no refresh token');
    }
    storageRemove(TOKEN_KEYS.ACCESS_TOKEN);
    storageRemove(TOKEN_KEYS.REFRESH_TOKEN);
    storageRemove(TOKEN_KEYS.TOKEN_EXPIRY);
    return null;
  }
}

// 内联实现 clearAuth，不依赖 auth.js
function clearAuth() {
  storageRemove(TOKEN_KEYS.ACCESS_TOKEN);
  storageRemove(TOKEN_KEYS.REFRESH_TOKEN);
  storageRemove(TOKEN_KEYS.USER);
  storageRemove(TOKEN_KEYS.TOKEN_EXPIRY);
}

export { PRIMARY_API, FALLBACK_API };
export { isBackendCircuitOpen, resetBackendCircuit, ApiUnavailableError };

// 超时再次大幅放宽：用户明确要求"以真正可用为优先级，不要一直降级走完流程"
// Vercel serverless 冷启动（5-10s）+ Edge Runtime 最长执行（30s）+ LLM 真实推理（10-25s）叠加
// 普通请求：50s（Vercel Edge 30s + 网络缓冲）
// SSE 流式：90s（多智囊顺序发言，每个Agent 10-20s，4个就是40-80s）
export const API_TIMEOUT = 50000;
export const SSE_TIMEOUT = 90000;

async function tryFetch(url, options = {}, timeout = API_TIMEOUT) {
  if (isBackendCircuitOpen()) {
    throw new ApiUnavailableError();
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } catch (e) {
    const name = e?.name || '';
    const msg = e?.message || String(e);
    // 根本性修复：只有「网络级不可达」才熔断整个后端。
    // AbortError 是前端主动超时 abort（可能是单接口慢/冷启动），不代表后端不可用，
    // 若因此熔断，会导致后续所有真实 LLM 对话/总结都降级成本地预设模板。
    const isNetworkUnreachable =
      name === 'TypeError' ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Network request failed') ||
      msg.includes('load failed') ||
      msg.includes('connection refused') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ERR_NAME_NOT_RESOLVED');
    if (isNetworkUnreachable) {
      tripBackendCircuit(name || 'connect_fail');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getActiveApi() {
  if (Date.now() < _apiUnavailableUntil) {
    return FALLBACK_API;
  }
  return _activeApi;
}

export async function markApiUnavailable(duration = 300000) {
  _apiUnavailableUntil = Date.now() + duration;
  _activeApi = FALLBACK_API;
}

export async function checkServerHealth() {
  const urls = [PRIMARY_API, FALLBACK_API];
  for (const url of urls) {
    try {
      const resp = await tryFetch(`${url}/health`, {}, 3000);
      if (resp.ok) {
        _activeApi = url;
        resetBackendCircuit();
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

async function requestWithFallback(path, options = {}, attempt = 1) {
  const api = await getActiveApi();
  const url = `${api}${path}`;
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  await injectAuthHeader(headers);

  const timeout = options.timeout || API_TIMEOUT;

  try {
    const resp = await tryFetch(url, { ...options, headers }, timeout);

    if (resp.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = { ...headers };
        retryHeaders['Authorization'] = `Bearer ${newToken}`;
        const retryResp = await tryFetch(url, { ...options, headers: retryHeaders }, timeout);
        return handleResponse(retryResp, path);
      }
      clearAuth();
      throw new Error(`API ${path} 鉴权失败 401: token 已失效`);
    }

    return handleResponse(resp, path);
  } catch (e) {
    // ★ 修复：同 request()，绝不无条件熔断。网络级不可达由 tryFetch 内部处理。
    throw e;
  }
}

/* ============================================================
   用户身份（向后兼容）
============================================================ */

/**
 * 获取当前用户 ID（向后兼容入口）
 * 内部委托给 auth.js 的 getCurrentUserId：
 *   - 登录用户 → user.id
 *   - 匿名云端用户 → user.id
 *   - 离线降级 → 本地匿名 ID
 * @returns {string} 用户 ID
 */
export function getUserId() {
  return getCurrentUserId();
}

/* ============================================================
   内部请求工具
============================================================ */

/**
 * 统一 fetch 封装，自动处理 JSON / 错误
 * - 自动注入 Authorization: Bearer <accessToken>
 * - access token 即将过期时先刷新
 * - 401 时尝试 refresh 并重试一次；刷新失败则清除 token
 * - 后端不可达时自动切换到备用地址（Railway）
 */
async function request(path, options = {}, attempt = 1) {
  const api = await getActiveApi();
  const cleanPath = path.startsWith('/api') ? path : `/api${path}`;
  const url = `${api}${cleanPath}`;
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  await injectAuthHeader(headers);
  const timeout = options.timeout || API_TIMEOUT;

  try {
    const resp = await tryFetch(url, { ...options, headers }, timeout);

    if (resp.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = { ...headers };
        retryHeaders['Authorization'] = `Bearer ${newToken}`;
        const retryResp = await tryFetch(url, { ...options, headers: retryHeaders }, timeout);
        return handleResponse(retryResp, path);
      }
      clearAuth();
      throw new Error(`API ${path} 鉴权失败 401: token 已失效`);
    }

    return handleResponse(resp, path);
  } catch (e) {
    // ★ 根本性修复：request 的 catch 里【绝不】无条件熔断后端。
    // 之前这里无条件 markApiUnavailable()（5分钟），导致单次请求超时（AbortError）
    // 就把整个后端拉黑 5 分钟 → 后续总结/命牌/全部降级成本地模板。
    // 网络级不可达已由 tryFetch 内部 tripBackendCircuit（30s）处理；
    // 这里只透传错误，让上层做单次降级，绝不影响其他请求。
    throw e;
  }
}

/**
 * 注入 Authorization 头，并在 token 即将过期时先刷新
 */
async function injectAuthHeader(headers) {
  if (headers['Authorization'] || headers['authorization']) return;
  let token = getAccessTokenSync();
  if (!token) {
    const userId = getCurrentUserIdSync();
    if (userId) {
      token = `local-${userId}`;
    } else {
      return;
    }
  }
  if (isTokenExpiringSoonSync()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) token = refreshed;
  }
  headers['Authorization'] = `Bearer ${token}`;
  
  if (token.startsWith('local-')) {
    const userId = token.replace('local-', '');
    headers['X-User-Id'] = userId;
  }
}

/**
 * 统一响应处理
 */
async function handleResponse(resp, path) {
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API ${path} 失败 ${resp.status}: ${errText.slice(0, 200)}`);
  }
  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return resp.json();
  }
  return resp.text();
}

/* ============================================================
   Agent 推演接口
============================================================ */

/**
 * 分析问题，返回动态 Agent 列表与推理过程
 * POST /api/agent/analyze → { agents, reasoning }
 */
export async function analyzeQuestion(question) {
  return request('/api/agent/analyze', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

/**
 * 演·深度分析：维度拆解 → 匹配已有智囊 + 动态生成新维度 Agent
 * POST /api/agent/analyze-v2 → { analysis, dimensions, seedAgents, sharedAgents, generatedAgents, recommendedIds, ... }
 * 返回的 generatedAgents: 后端新生成的 Agent（新维度，不在 pool 中）
 * 返回的 recommendedIds: 演推荐的已有智囊 ID（从 seedAgents/sharedAgents 中挑出的推荐）
 */
export async function analyzeQuestionV2(question, options = {}) {
  return request('/api/agent/analyze-v2', {
    method: 'POST',
    body: JSON.stringify({ question, useSharedPool: true, ...options }),
  });
}

/**
 * 通用意图识别（5 维特征提取 + 澄清问题）
 * POST /api/agent/intent/classify → { intent, assessment }
 */
export async function classifyIntent(question) {
  return request('/api/agent/intent/classify', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

/**
 * LLM 动态生成决策树（替代硬编码 nodes.js）
 * POST /api/agent/tree/generate → { tree, fallback }
 */
export async function generateTree(question, intent = null, userMemory = '') {
  return request('/api/agent/tree/generate', {
    method: 'POST',
    body: JSON.stringify({ question, intent, userMemory }),
  });
}

/**
 * 流式获取单个 Agent 的对话（SSE）
 * POST /api/agent/dialogue
 * @param {Object} agent - Agent 对象（含 id/name/stance/persona 等）
 * @param {string} question - 用户问题
 * @param {Array|Object} previousDialogues - 之前 Agent 的对话，供当前 Agent 参考
 * @param {Function} onChunk - 每收到一段文字时的回调 (text) => void
 * @param {Object} options - 额外参数（Blackboard mention 协议 + 工具调用回调）
 *   - pendingMentions: 该 Agent 待回应的 mention 列表 [{from, fromName, to, snippet, question, type, msgId}]
 *   - availableAgents: 可被 @ 的智囊列表 [{id, name, stance}]
 *   - onToolStart: (tools:string[]) => void  收到 event:start 时触发
 *   - onToolCall: (tool:string, params:object) => void  收到 event:tool_call 时触发
 *   - onToolResult: (tool:string, summary:string, status:string) => void  收到 event:tool_result 时触发
 */
export async function streamAgentDialogue(agent, question, previousDialogues, onChunk, options = {}) {
  const agentId = typeof agent === 'string' ? agent : agent.id;
  const dialoguesArray = Array.isArray(previousDialogues)
    ? previousDialogues
    : Object.entries(previousDialogues).map(([id, text]) => ({ agentId: id, text }));

  const streamHeaders = { 'Content-Type': 'application/json' };
  await injectAuthHeader(streamHeaders);

  const api = await getActiveApi();

  const requestBody = {
    agentId,
    question,
    previousDialogues: dialoguesArray,
  };

  // Blackboard mention 协议：传递待回应 mention 和可用智囊（Step 3 后端会注入 prompt）
  if (Array.isArray(options.pendingMentions) && options.pendingMentions.length > 0) {
    requestBody.pendingMentions = options.pendingMentions;
  }
  if (Array.isArray(options.availableAgents) && options.availableAgents.length > 0) {
    requestBody.availableAgents = options.availableAgents;
  }
  
  if (typeof agent === 'object' && agent !== null) {
    // ★ glm5.2 级强个性注入：三层 persona + 写作风格 guardrail
    // 防止高质量模型退化成"通用对话助手"风格
    const personaFromAgent = agent.persona || '';
    const stance = agent.stance || agent.perspective || '旁观者视角';
    const name = agent.name || '智囊';
    // 强约束（写作风格 guardrail）——无论模型多强，这些是红线
    const STRONG_GUARDRAIL = `
【身份约束】
你现在的名字是「${name}」，站在「${stance}」立场思考问题。你不是通用 AI 助手，你是一个有血有肉、有性格偏见的幕僚/长者/朋友。
- 永远不要说「作为AI助手」「我理解你的困惑」「这需要你自己决定」这类通用开场白
- 永远不要同时列出 A/B 两面然后说"各有利弊，你自己选"——这是骑墙派，你的立场必须鲜明
- 不要用"首先/其次/最后"这种八股结构，像真人一样自然说
- 不要说"希望对你有帮助""加油""祝你好运"这种客服式结尾

【说话风格】
- 用第一人称「我」说话，直接给判断，不要绕弯子
- 前 3 句之内必须亮出你的核心观点，不要铺垫
- 用具体的追问、具体的数字、具体的场景举例，不要讲空泛大道理
- 偶尔可以犀利、可以毒舌、可以拍桌子，但不能恶意攻击，要像真朋友掏心窝子说话
- 100 字以内解决问题，不要长篇大论

【禁止】
- 禁止【】《》这类代码括号
- 禁止 Markdown 标题、序号列表格式
- 禁止 emoji、图标、特殊符号
- 禁止道德说教和政治正确套话`;
    const mergedPersona = [personaFromAgent, STRONG_GUARDRAIL].filter(Boolean).join('\n\n');
    requestBody.agentConfig = {
      name: agent.name,
      stance: agent.stance || agent.perspective,
      persona: mergedPersona,
      color: agent.color,
      icon: agent.icon,
      relation: agent.relation,
      relationLabel: agent.relationLabel,
      contextSummary: agent.contextSummary,
      blessing: agent.blessing,
      perspective: agent.perspective,
      forged: agent.forged,
    };
  }

  const resp = await fetch(`${api}/api/agent/dialogue`, {
    method: 'POST',
    headers: streamHeaders,
    body: JSON.stringify(requestBody),
    // ★ 关键修复：Agent 对话初始 fetch 必须加超时信号
    // 否则 Vercel 冷启动或 LLM 端挂起时，Promise 永远不 resolve/reject，
    // 前端整体 race 到了 25s 超时 → 所有 Agent 一起降级成本地发言。
    // 90s 上限保证 Edge Runtime 30s + 推理时间内都能正常返回。
    signal: AbortSignal.timeout(SSE_TIMEOUT),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Agent 对话失败 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  // 不支持流式时降级：直接读全文
  if (!resp.body) {
    const text = await resp.text();
    if (text && onChunk) onChunk(text);
    return;
  }

  // 工具调用回调（Step 3：SSE 事件扩展）
  const { onToolStart, onToolCall, onToolResult } = options;

  let sseTimeout = null;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  // SSE 事件类型追踪：event: 行设置 currentEvent，data: 行据此分发
  // 空行（事件块边界）重置 currentEvent。无 event 前缀的 data 视为普通内容流。
  let currentEvent = null;
  const resetSSETimeout = () => {
    if (sseTimeout) clearTimeout(sseTimeout);
    sseTimeout = setTimeout(() => {
      console.warn('[SSE] 流式输出超时，可能已断线');
      try { reader.cancel(); } catch (e) { /* ignore */ }
    }, SSE_TIMEOUT);
  };
  resetSSETimeout();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      resetSSETimeout();

      let nlIdx;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);

        // 空行 = SSE 事件块边界，重置 currentEvent
        if (!line) {
          currentEvent = null;
          continue;
        }

        // event: 行 — 设置当前事件类型
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          // event:done 直接结束（后续 data 行无需处理）
          if (currentEvent === 'done') {
            if (sseTimeout) clearTimeout(sseTimeout);
            return;
          }
          continue;
        }

        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            if (sseTimeout) clearTimeout(sseTimeout);
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // 按事件类型分发（Step 3：工具调用事件）
            if (currentEvent === 'start') {
              if (onToolStart && Array.isArray(parsed.tools)) onToolStart(parsed.tools);
            } else if (currentEvent === 'tool_call') {
              if (onToolCall) onToolCall(parsed.tool, parsed.params || {});
            } else if (currentEvent === 'tool_result') {
              if (onToolResult) onToolResult(parsed.tool, parsed.summary, parsed.status);
            } else if (currentEvent === 'fallback') {
              // 降级事件：把 fallback 文本作为内容流送入打字机
              const text = parsed.text || parsed.content || '';
              if (text && onChunk) onChunk(text);
            } else {
              // 默认（无 event 前缀的流式内容，或未知事件）：作为发言内容
              const text = parsed.content || parsed.text || parsed.delta || '';
              if (text && onChunk) onChunk(text);
            }
          } catch {
            // JSON 解析失败：仅在无事件类型时作为原始文本送入
            if (!currentEvent && data && onChunk) onChunk(data);
          }
        }
      }
    }
  } finally {
    if (sseTimeout) clearTimeout(sseTimeout);
  }
}

/**
 * Agent 反问用户
 * POST /api/agent/ask
 * @param {string} agentId - Agent ID
 * @param {string} question - 用户原始问题
 * @param {Array} dialogueHistory - 对话历史 [{ speaker, text, agentId }]
 * @returns {Promise<{agentId, agentName, question, needMoreInfo}>}
 */
export async function askQuestion(agentId, question, dialogueHistory = [], options = {}) {
  const { multiple = true, count = 3 } = options;
  return request('/api/agent/ask', {
    method: 'POST',
    body: JSON.stringify({ agentId, question, dialogueHistory, multiple, count }),
  });
}

/**
 * 判断 Agent 是否需要继续追问
 * POST /api/agent/continue-ask
 * @param {string} agentId - Agent ID
 * @param {string} originalQuestion - 用户原始问题
 * @param {Array} dialogueHistory - 对话历史
 * @param {string} lastUserAnswer - 用户上一次回答
 * @returns {Promise<{agentId, agentName, continueAsking, nextQuestion}>}
 */
export async function continueAsking(agentId, originalQuestion, dialogueHistory = [], lastUserAnswer = '') {
  return request('/api/agent/continue-ask', {
    method: 'POST',
    body: JSON.stringify({ agentId, originalQuestion, dialogueHistory, lastUserAnswer }),
  });
}

/**
 * 演的全局总结
 * POST /api/agent/summary
 * @param {string} originalQuestion - 用户原始问题
 * @param {Array} agentIds - 参与的 Agent ID 列表
 * @param {Object} dialogueHistory - 完整对话历史 { agentId: Array<string> }
 * @returns {Promise<{summary, options}>}
 */
export async function generateSummary(originalQuestion, agentIds = [], dialogueHistory = {}, options = {}) {
  return request('/api/agent/summary', {
    method: 'POST',
    body: JSON.stringify({ originalQuestion, agentIds, dialogueHistory }),
    timeout: options.timeout,
  });
}

/* ============================================================
   卜卦接口
============================================================ */

/**
 * 起卦
 * POST /api/divination/cast → 卦象数据
 */
export async function castHexagram(question) {
  return request('/api/divination/cast', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

/**
 * 解卦
 * POST /api/divination/interpret
 * @param {Object} hexagram - 卦象数据
 * @param {string} question - 用户问题
 * @param {Object} agentDialogues - 各 Agent 的对话
 */
export async function interpretHexagram(hexagram, question, agentDialogues) {
  return request('/api/divination/interpret', {
    method: 'POST',
    body: JSON.stringify({ hexagram, question, agentDialogues }),
  });
}

/* ============================================================
   命运卡接口
============================================================ */

/**
 * 获取用户的所有命运卡
 * GET /api/cards?userId=xxx
 */
export async function getCards(userId) {
  return request(`/api/cards?userId=${encodeURIComponent(userId)}`);
}

/**
 * 保存命运卡
 * POST /api/cards
 */
export async function saveCard(card) {
  return request('/api/cards', {
    method: 'POST',
    body: JSON.stringify(card),
  });
}

/**
 * 更新命运卡
 * PUT /api/cards/:id
 */
export async function updateCard(id, card) {
  return request(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(card),
  });
}

/**
 * 删除命运卡
 * DELETE /api/cards/:id
 */
export async function deleteCard(id) {
  return request(`/api/cards/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/**
 * 分享命运卡
 * POST /api/cards/:id/share
 */
export async function shareCard(id) {
  return request(`/api/cards/${encodeURIComponent(id)}/share`, {
    method: 'POST',
  });
}

/* ============================================================
   社区接口
============================================================ */

/**
 * 获取社区帖子列表
 * GET /api/community/posts
 * @param {string} sort - 排序方式 (hot/new 等)
 * @param {string} tag - 标签筛选
 */
export async function getCommunityPosts(sort, tag) {
  const params = new URLSearchParams();
  if (sort) params.set('sort', sort);
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  return request(`/api/community/posts${qs ? `?${qs}` : ''}`);
}

/**
 * 创建社区帖子
 * POST /api/community/posts
 */
export async function createPost(post) {
  return request('/api/community/posts', {
    method: 'POST',
    body: JSON.stringify(post),
  });
}

/**
 * 回复帖子
 * POST /api/community/posts/:id/replies
 */
export async function replyPost(postId, reply) {
  return request(`/api/community/posts/${encodeURIComponent(postId)}/replies`, {
    method: 'POST',
    body: JSON.stringify(reply),
  });
}

/**
 * 点赞帖子
 * POST /api/community/posts/:id/like
 */
export async function likePost(postId) {
  return request(`/api/community/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST',
  });
}

/* ============================================================
   每日 / 日历 / 成就接口
============================================================ */

/**
 * 获取每日内容
 * GET /api/daily?date=xxx
 */
export async function getDaily(date) {
  return request(`/api/daily?date=${encodeURIComponent(date)}`);
}

/**
 * 获取用户日历
 * GET /api/calendar?userId=xxx
 */
export async function getCalendar(userId) {
  return request(`/api/calendar?userId=${encodeURIComponent(userId)}`);
}

/**
 * 获取用户成就
 * GET /api/achievements?userId=xxx
 */
export async function getAchievements(userId) {
  return request(`/api/achievements?userId=${encodeURIComponent(userId)}`);
}

/* ========== 演的对话 ========== */

/**
 * 与演对话（SSE 流式）
 * POST /yan/chat/stream
 * @param {Object} params
 * @param {string} params.message
 * @param {string} [params.conversationId]
 * @param {Function} onChunk - 每段文本回调 (chunk, fullText, convId, meta?) => void
 *   meta: { suggest_inference?: boolean, inference_question?: string } 推演台推荐信号
 */
export async function streamYanChat({ message, conversationId, history }, onChunk) {
  if (isBackendCircuitOpen()) {
    return {
      text: '',
      conversationId: conversationId || `local-${Date.now()}`,
      suggest_inference: false,
      inference_question: '',
      _silentFallback: true,
    };
  }
  const streamHeaders = { 'Content-Type': 'application/json' };
  await injectAuthHeader(streamHeaders);

  const api = await getActiveApi();
  let resp;
  try {
    resp = await fetch(`${api}/api/yan/chat/stream`, {
      method: 'POST',
      headers: streamHeaders,
      body: JSON.stringify({ message, conversationId, history }),
      signal: AbortSignal.timeout(SSE_TIMEOUT),
    });
  } catch (e) {
    const name = e?.name || '';
    const msg = e?.message || String(e);
    // ★ 根本性修复：只有真正的「网络级不可达」才熔断整个后端（30秒内所有请求走本地）
    // AbortError / TimeoutError 是前端主动超时（单接口慢、LLM 推理久），绝不代表后端不可用！
    // 如果把超时也算作熔断条件，一次澄清追问超时 → 后续所有智囊发言/总结/命牌全部降级，
    // 这才是用户说的"前面对话好好的，然后突然就全部降级了"的根因。
    const isNetworkUnreachable =
      name === 'TypeError' ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Network request failed') ||
      msg.includes('load failed') ||
      msg.includes('connection refused') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ERR_NAME_NOT_RESOLVED');
    if (isNetworkUnreachable) {
      tripBackendCircuit(name || 'sse_network_fail');
    } else {
      // 非网络错误（超时/abort 等）：只记日志，不熔断
      console.warn('[yan] 单请求失败（不熔断后端）:', name, msg.slice(0, 100));
    }
    return {
      text: '',
      conversationId: conversationId || `local-${Date.now()}`,
      suggest_inference: false,
      inference_question: '',
      _silentFallback: true,
    };
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (resp.status === 401) {
      console.warn('[yan] 未登录，返回预设回复');
      return {
        text: '我听到了你说的，但听到的只是表层。\n请允许我问三点：\n一、这件事最坏的结果，你能否承受？\n二、三年后回看今天，你希望自己已经做了什么？\n三、你此刻最怕的不是失败，而是什么？\n回答之前不必急，先静坐片刻。',
        conversationId: conversationId || 'anonymous-' + Date.now(),
        hasUserId: false,
      };
    }
    throw new Error(err.error || '对话失败');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let convId = conversationId || null;
  let suggestInference = false;
  let inferenceQuestion = '';

  let sseTimeout = null;
  const resetSSETimeout = () => {
    if (sseTimeout) clearTimeout(sseTimeout);
    sseTimeout = setTimeout(() => {
      console.warn('[SSE] 演对话流式输出超时，可能已断线');
      try { reader.cancel(); } catch (e) { /* ignore */ }
    }, SSE_TIMEOUT);
  };
  resetSSETimeout();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      resetSSETimeout();

      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'conversation_id') {
            convId = data.id;
          } else if (data.type === 'content') {
            fullText += data.content;
            if (onChunk) onChunk(data.content, fullText, convId);
          } else if (data.type === 'suggest_inference') {
            suggestInference = true;
            inferenceQuestion = data.inference_question || '';
            if (onChunk) onChunk('', fullText, convId, {
              suggest_inference: true,
              inference_question: inferenceQuestion,
            });
          } else if (data.type === 'error') {
            console.warn('[yan] 服务端流式错误:', data.message);
            fullText += `\n\n[服务端错误: ${data.message || '未知'}]`;
          }
        } catch (e) {
          if (e.message !== '流式错误') console.warn('[yan] 解析SSE失败:', e.message);
        }
      }
    }
  } finally {
    if (sseTimeout) clearTimeout(sseTimeout);
  }

  return {
    text: fullText,
    conversationId: convId,
    suggest_inference: suggestInference,
    inference_question: inferenceQuestion,
  };
}

/**
 * 获取对话历史
 * GET /api/yan/messages?conversationId=xxx
 */
export async function getYanMessages(conversationId) {
  return request(`/api/yan/messages?conversationId=${encodeURIComponent(conversationId)}`);
}

/**
 * 获取演的今日卦象
 * GET /api/yan/daily
 */
export async function getYanDaily() {
  return request('/api/yan/daily');
}

const LOCAL_MEMORIES_KEY = 'yance_yan_memories_local';

function getLocalMemories() {
  try {
    const raw = localStorage.getItem(LOCAL_MEMORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMemory(memory) {
  try {
    const list = getLocalMemories();
    list.unshift(memory);
    if (list.length > 100) list.length = 100;
    localStorage.setItem(LOCAL_MEMORIES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * 保存演的长期记忆
 * POST /api/yan/memories
 * 失败时自动存入 localStorage 兜底
 * @param {Object} memory
 * @param {string} memory.category - 记忆分类（deduction/preference/fact/profile 等）
 * @param {string} memory.title - 记忆标题
 * @param {string} memory.content - 记忆内容
 * @param {string} [memory.source] - 来源
 * @param {number} [memory.confidence] - 置信度 0-1
 * @returns {Promise<Object>} 保存结果
 */
export async function addYanMemory(memory) {
  const mem = {
    id: memory.id || `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category: memory.category || 'fact',
    title: memory.title || '',
    content: memory.content || '',
    source: memory.source || '推演台',
    confidence: memory.confidence ?? 0.8,
    date: memory.date || new Date().toISOString().split('T')[0],
    createdAt: Date.now(),
  };

  try {
    const result = await request('/api/yan/memories', {
      method: 'POST',
      body: JSON.stringify(mem),
    });
    return result || mem;
  } catch (e) {
    console.warn('[apiClient] addYanMemory 后端失败，存入本地', e.message);
    saveLocalMemory(mem);
    return mem;
  }
}

/**
 * 获取用户记忆
 * GET /api/yan/memories
 * 后端失败或为空时，自动合并本地 localStorage 中的记忆
 */
export async function getYanMemories(query = '') {
  const localMems = getLocalMemories();
  try {
    const q = query ? `&query=${encodeURIComponent(query)}` : '';
    const api = await getActiveApi();
    const headers = { 'Content-Type': 'application/json' };
    await injectAuthHeader(headers);
    const resp = await fetch(`${api}/api/yan/memories${q ? '?' + q.slice(1) : ''}`, {
      method: 'GET',
      headers,
    });
    const data = resp.ok ? await resp.json() : {};
    const serverMems = Array.isArray(data) ? data : (data?.memories || []);
    const seen = new Set();
    const merged = [];
    serverMems.forEach(m => {
      if (!m.id) return;
      seen.add(m.id);
      merged.push(m);
    });
    localMems.forEach(m => {
      if (m.id && !seen.has(m.id)) {
        merged.push(m);
        seen.add(m.id);
      }
    });
    merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return merged;
  } catch (e) {
    console.warn('[apiClient] getYanMemories 后端失败，返回本地记忆', e.message);
    return localMems;
  }
}

/* ============================================================
   等级 / 签到接口
============================================================ */

/**
 * 获取等级信息
 * GET /api/level
 * @returns {Promise<Object>} { level, realm, xp, xpToNext, streak, alreadyCheckedIn, realms, xpRewards }
 */
export async function getLevelInfo() {
  return request('/api/level');
}

/**
 * 每日签到
 * POST /api/level/checkin
 * @returns {Promise<Object>} { success, streak, xpGained, leveledUp, newRealm }
 */
export async function checkIn() {
  return request('/api/level/checkin', {
    method: 'POST',
  });
}

/**
 * 增加经验值
 * POST /api/level/xp
 * @param {number} amount - 经验值数量
 * @param {string} reason - 经验来源 (必须是 XP_REWARDS 中定义的键)
 * @returns {Promise<Object>} { success, newXP, newLevel, leveledUp, newRealm }
 */
export async function addXP(amount, reason) {
  return request('/api/level/xp', {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });
}

/* ============================================================
   决策回访提醒接口
============================================================ */

/**
 * 获取回访列表
 * GET /api/follow-up?status=xxx
 * @param {string} status - 状态: pending/check/留空获取全部
 */
export async function getFollowUps(status) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return request(`/api/follow-up${qs ? `?${qs}` : ''}`);
}

/**
 * 安排回访
 * POST /api/follow-up
 * @param {string} cardId - 命运卡ID
 * @param {string} question - 问题
 * @param {string} decision - 决策
 * @param {number} daysLater - 多少天后回访
 */
export async function scheduleFollowUp(cardId, question, decision, daysLater = 7) {
  return request('/api/follow-up', {
    method: 'POST',
    body: JSON.stringify({ cardId, question, decision, daysLater }),
  });
}

/**
 * 完成回访
 * PUT /api/follow-up/:id
 * @param {string} id - 回访记录ID
 * @param {string} result - 回访结果/心得
 */
export async function completeFollowUp(id, result) {
  return request(`/api/follow-up/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ result }),
  });
}

/* ============================================================
   笔记接口
============================================================ */

/**
 * 获取卡片的笔记列表
 * GET /api/cards/:id/notes
 */
export async function getCardNotes(cardId) {
  return request(`/api/cards/${encodeURIComponent(cardId)}/notes`);
}

/**
 * 添加笔记
 * POST /api/cards/:id/notes
 */
export async function addCardNote(cardId, note) {
  return request(`/api/cards/${encodeURIComponent(cardId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ content: note }),
  });
}

/**
 * 删除笔记
 * DELETE /api/cards/:id/notes/:noteId
 */
export async function deleteCardNote(cardId, noteId) {
  return request(`/api/cards/${encodeURIComponent(cardId)}/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}

/* ============================================================
   认证 / 用户资料 / 数据同步接口
============================================================ */

/**
 * 获取当前登录用户信息
 * GET /api/auth/me → { user }
 */
export async function getMyProfile() {
  return request('/api/auth/me');
}

/**
 * 更新用户资料
 * PUT /api/users/profile → { user }
 * @param {Object} data - { nickname?, avatar?, color?, bio? }
 */
export async function updateProfile(data) {
  return request('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * 迁移本地数据到云端（合并去重）
 * POST /api/sync/migrate → { success, migrated, skipped, syncedAt }
 * @param {Object} payload - 本地数据载荷
 */
export async function migrateLocalData(payload) {
  return request('/api/sync/migrate', {
    method: 'POST',
    body: JSON.stringify({ data: payload }),
  });
}

/**
 * 获取云端同步状态
 * GET /api/sync/status → { lastSyncedAt, today, counts }
 */
export async function getSyncStatus() {
  return request('/api/sync/status');
}

/**
 * 导出当前用户全部云端数据
 * GET /api/sync/export → { exportedAt, version, user, cards, ... }
 */
export async function exportCloudData() {
  return request('/api/sync/export');
}

/**
 * 从云端拉取全部数据（合并到本地）
 * POST /api/sync/pull → { success, pulledAt, cards, user_memories, custom_advisors, achievements }
 */
export async function pullCloudData() {
  return request('/api/sync/pull', { method: 'POST' });
}
