/**
 * 新轨推演 API 客户端（/api/deliberation/*）
 * 封装 5 个端点，供前端 DeliberationPage 调用
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 6.3 节 / docs/REAL_AGENT_FEASIBILITY.md 第 4 节
 */

import { anonymousLogin, getAccessToken, refreshAccessToken } from './auth.js';
import { recoverAccessToken } from './authRecovery.js';
import { API_BASE_URL } from './baseConfig.js';
import { buildDeliberationBases } from './deliberationBase.js';
import { probeDeliberationHealth } from './deliberationHealth.js';
import {
  advanceSseCursor,
  openAuthenticatedSse,
  readStoredSseCursor,
  writeStoredSseCursor,
} from './sseStream.js';
import {
  createCommitRequest,
  createExecuteRequest,
  normalizeExecuteResponse,
} from '../../shared/deliberationContract.js';

const CLOG = {
  fetch: (m, p) => console.log(`[FETCH] ${m} ${p}`),
  resp: (m, p, s) => console.log(`[RESP] ${m} ${p} → ${s}`),
  local: (p) => console.log(`[LOCAL] short-circuit: ${p}`),
  error: (m, p, e) => console.error(`[ERR] ${m} ${p}:`, e?.message || e),
};

/* ============================================================
   先声明 base 相关变量（避免 RUN_MODE 里的 probeBackend TDZ）
============================================================ */
const FORCED_BASE = import.meta.env.VITE_DELIBERATION_API_BASE || null;
const CACHE_KEY = 'deliberation_base_cache';
const BASE_CANDIDATES = buildDeliberationBases({
  explicitBase: FORCED_BASE,
  apiBase: API_BASE_URL,
});

let _cachedBase = (() => {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    if (v && BASE_CANDIDATES.includes(v)) return v;
  } catch {}
  return null;
})();

let _authRecoveryPromise = null;

function recoverDeliberationAuthentication() {
  if (!_authRecoveryPromise) {
    _authRecoveryPromise = recoverAccessToken({
      refresh: refreshAccessToken,
      anonymous: anonymousLogin,
    }).finally(() => {
      _authRecoveryPromise = null;
    });
  }
  return _authRecoveryPromise;
}

function _persistBase(b) {
  _cachedBase = b;
  try { localStorage.setItem(CACHE_KEY, b); } catch {}
}

/* ============================================================
   运行模式显式切换（解决「后端挂了仍报一堆 404/500 / 静默降级不可见」的坑）
   - AUTO:       默认，首次启动自动探测
   - REMOTE:     强制使用后端（真实 deliberation 服务）
   - LOCAL_FULL: 完全本地，不发任何请求，所有 API 直接返回本地成功响应
   显式模式持久化到 localStorage，用户重启后仍保持
============================================================ */
const MODE_KEY = 'deliberation_run_mode';
/** @type {'AUTO'|'REMOTE'|'LOCAL_FULL'} */
let RUN_MODE = (() => {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'REMOTE' || v === 'LOCAL_FULL' || v === 'AUTO') return v;
  } catch {}
  return 'AUTO';
})();

export function getRunMode() { return RUN_MODE; }
export function setRunMode(mode) {
  if (mode !== 'REMOTE' && mode !== 'LOCAL_FULL' && mode !== 'AUTO') return;
  RUN_MODE = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  // 切回 AUTO/REMOTE 时清缓存 base，让下次重新探测
  if (mode !== 'LOCAL_FULL') {
    _cachedBase = null;
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }
}

export async function probeBackend(timeoutMs = 3000) {
  if (RUN_MODE === 'LOCAL_FULL') return false;
  const bases = _cachedBase
    ? [_cachedBase, ...BASE_CANDIDATES.filter((base) => base !== _cachedBase)]
    : BASE_CANDIDATES;
  const result = await probeDeliberationHealth({ bases, timeoutMs });
  if (result.ok) _persistBase(result.base);
  return result.ok;
}

/**
 * 统一 fetch 包装：内置 fallback 链 + 自动重试下一候选 + LOCAL_FULL 短路
 * @param {string} path  /api/deliberation/xxx
 * @param {RequestInit} init
 * @param {{throwOnError?: boolean}} opts
 */
async function _deliberationFetch(path, init = {}, opts = {}) {
  const throwOnError = opts.throwOnError !== false;

  // === LOCAL_FULL 模式：不发任何真实请求，直接返回统一的成功空响应 ===
  // 这样后端挂时，所有调用 deliberationClient 的路径都不会 404/500 报错
  if (RUN_MODE === 'LOCAL_FULL') {
    CLOG.local(path);
    const payload = { sessionId: 'ls_' + Date.now().toString(36), state: 'LOCAL_FULL' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  let accessToken = getAccessToken();
  if (!accessToken) {
    accessToken = await recoverDeliberationAuthentication();
    if (!accessToken) {
      const error = new Error('AUTH_REQUIRED');
      error.code = 'AUTH_REQUIRED';
      error.status = 401;
      throw error;
    }
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  let authenticatedInit = { ...init, headers };

  // 已有缓存 base → 直接尝试（快路径）
  const candidates = _cachedBase
    ? [_cachedBase, ...BASE_CANDIDATES.filter(b => b !== _cachedBase)]
    : BASE_CANDIDATES;

  const errors = [];
  for (let i = 0; i < candidates.length; i++) {
    const base = candidates[i];
    const url = `${base}${path}`;
    try {
      CLOG.fetch(authenticatedInit.method || 'GET', path);
      let resp = await fetch(url, authenticatedInit);
      if (resp.status === 401) {
        const recoveredToken = await recoverDeliberationAuthentication();
        if (recoveredToken) {
          const retryHeaders = new Headers(init.headers || {});
          retryHeaders.set('Authorization', `Bearer ${recoveredToken}`);
          authenticatedInit = { ...init, headers: retryHeaders };
          resp = await fetch(url, authenticatedInit);
        }
      }
      if (resp.ok) {
        // 记住第一个可用 base（加速后续请求）
        if (!_cachedBase || _cachedBase !== base) _persistBase(base);
        CLOG.resp(init?.method || 'GET', path, resp.status);
        return resp;
      }
      errors.push(`[${base || '/'}] HTTP ${resp.status}`);
      // 4xx（除 404 "Application not found" 这种后端不存在信号外）通常是请求本身问题，不重试下一个
      if (resp.status >= 400 && resp.status < 500) {
        let body = {};
        try { body = await resp.json(); } catch {}
        if (resp.status === 404 && /Application not found|not ?found/i.test(body?.message || '')) {
          // 候选后端部署不存在时继续尝试下一个 base
          continue;
        }
        if (throwOnError) {
          const err = new Error(body?.error || `请求失败: ${resp.status}`);
          err.status = resp.status;
          err.body = body;
          throw err;
        }
        return resp;
      }
      // 5xx：继续 fallback
    } catch (e) {
      CLOG.error(authenticatedInit.method, path, e);
      if (e?.status >= 400 && e.status < 500) throw e;
      // 网络错误 / CORS / 拒绝连接：继续 fallback
      errors.push(`[${base || '/'}] ${e.message || 'NetworkError'}`);
    }
  }

  // 全部候选失败
  const msg = `所有推演后端不可用: ${errors.join(' → ')}。请启动本地后端（npm --prefix server run dev）或检查网络。`;
  console.error('[deliberationClient]', msg);
  if (throwOnError) {
    const err = new Error(msg);
    err.status = 0;
    err.backendErrors = errors;
    throw err;
  }
  // 返回一个假的失败 resp，供调用方 !resp.ok 分支处理
  return new Response(JSON.stringify({ error: msg }), { status: 0, headers: { 'content-type': 'application/json' } });
}

/**
 * 发起推演
 * POST /api/deliberation/start
 * @param {string} question
 * @returns {Promise<{sessionId, state, askUser, plan, round, maxRound, openingLine, memory}>}
 */
export async function startDeliberation(question, options = {}) {
  const resp = await _deliberationFetch('/api/deliberation/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, deferPlanning: options.deferPlanning === true }),
  });
  const data = await resp.json().catch(() => ({}));
  // LOCAL_FULL：如果返回内容是空 mock，就补一个明确的 state 给调用方识别
  if (RUN_MODE === 'LOCAL_FULL' && !data?.state) {
    data.state = 'LOCAL_FULL';
    data.sessionId = data.sessionId || ('ls_' + Date.now().toString(36));
  }
  return data;
}

export async function planDeliberation(sessionId) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return resp.json().catch(() => ({}));
}

/**
 * 回答追问
 * POST /api/deliberation/:sessionId/answer
 */
export async function answerDeliberation(sessionId, answers) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `answer 失败: ${resp.status}`);
  }
  return data;
}

export async function confirmCaseDeliberation(sessionId, command = {}) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/confirm-case`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      acceptedMemoryIds: Array.isArray(command.acceptedMemoryIds) ? command.acceptedMemoryIds : [],
      additionalContext: String(command.additionalContext || ''),
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `confirm-case 失败: ${resp.status}`);
  return data;
}

/**
 * 执行智囊发言 / 推演循环
 * POST /api/deliberation/:sessionId/execute
 */
export async function executeDeliberation(sessionId, command) {
  const payload = createExecuteRequest(command);
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `execute 失败: ${resp.status}`);
  }
  return normalizeExecuteResponse(data);
}

/**
 * 提交用户抉择 / 落卦
 * POST /api/deliberation/:sessionId/commit
 */
export async function commitDeliberation(sessionId, command) {
  const payload = createCommitRequest(command);
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || `commit 失败: ${resp.status}`);
  }
  return data;
}

/**
 * 获取 session 状态
 * GET /api/deliberation/:sessionId
 */
export async function getDeliberation(sessionId) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}`, {}, { throwOnError: false });
  return resp.json ? resp.json().catch(() => ({})) : {};
}

/**
 * 拉取历史记忆（long-term memory）
 * GET /api/deliberation/memories
 */
export async function getMemories() {
  try {
    const resp = await _deliberationFetch('/api/deliberation/memories', {}, { throwOnError: false });
    const body = resp.json ? await resp.json().catch(() => ({})) : {};
    return Array.isArray(body?.memories) ? body.memories : [];
  } catch (e) {
    console.warn('[getMemories] 拉取失败，返回空:', e);
    return [];
  }
}

/**
 * 获取用户自定义智囊（advisors）
 * GET /api/deliberation/advisors
 */
export async function getAdvisors() {
  try {
    const resp = await _deliberationFetch('/api/deliberation/advisors', {}, { throwOnError: false });
    const body = resp.json ? await resp.json().catch(() => ({})) : {};
    return Array.isArray(body?.advisors) ? body.advisors : [];
  } catch (e) {
    console.warn('[getAdvisors] 拉取失败，返回空:', e);
    return [];
  }
}

/**
 * 新建自定义智囊
 * POST /api/deliberation/advisors
 */
export async function createAdvisor(advisor) {
  const resp = await _deliberationFetch('/api/deliberation/advisors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(advisor),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `创建智囊失败: ${resp.status}`);
  return data;
}

/**
 * 更新自定义智囊
 * PUT /api/deliberation/advisors/:id
 */
export async function updateAdvisor(id, patch) {
  const resp = await _deliberationFetch(`/api/deliberation/advisors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `更新智囊失败: ${resp.status}`);
  return data;
}

/**
 * 删除自定义智囊
 * DELETE /api/deliberation/advisors/:id
 */
export async function deleteAdvisor(id) {
  const resp = await _deliberationFetch(`/api/deliberation/advisors/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `删除智囊失败: ${resp.status}`);
  return data;
}

/**
 * 保存当前推演快照（便于复盘 / 推演记录页）
 * POST /api/deliberation/:sessionId/snapshot
 */
export async function saveSnapshot(sessionId, snapshot) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `保存快照失败: ${resp.status}`);
  return data;
}

/**
 * 恢复历史 session（推演记录点继续）
 * GET /api/deliberation/:sessionId/resume
 */
export async function resumeDeliberation(sessionId) {
  try {
    const resp = await _deliberationFetch(
      `/api/deliberation/${sessionId}/resume`,
      {},
      { throwOnError: false }
    );
    return resp.json ? resp.json().catch(() => ({})) : {};
  } catch (e) {
    console.warn('[resumeDeliberation] 恢复失败:', e);
    return {};
  }
}

/**
 * 暂停 / 恢复 SSE 流
 */
export async function pauseStream(sessionId) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return resp.json ? resp.json().catch(() => ({})) : {};
}
export async function resumeStream(sessionId) {
  const resp = await _deliberationFetch(`/api/deliberation/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return resp.json ? resp.json().catch(() => ({})) : {};
}

/* ============================================================
   SSE: subscribeDeliberationStream(sessionId, callbacks)
   callbacks: onEvent / onAdvisorSpeak / onStateChange / onObservation / onError / onOpen / onClose
   带 LOCAL_FULL 短路：完全本地模式下，直接走 onOpen 然后不发任何事件。
============================================================ */
export function subscribeDeliberationStream(sessionId, callbacks) {
  const handlers = typeof callbacks === 'function' ? { onEvent: callbacks } : (callbacks || {});
  const { onEvent, onAdvisorSpeak, onStateChange, onObservation, onError, onOpen, onClose } = handlers;

  // LOCAL_FULL：不连真实 SSE，立即给 onOpen + onClose 都发，避免逻辑挂住
  if (RUN_MODE === 'LOCAL_FULL') {
    let closed = false;
    const fakeSource = {
      get readyState() { return closed ? 2 : 1; },
      close() { closed = true; onClose?.(); },
    };
    setTimeout(() => onOpen && onOpen(), 0);
    return fakeSource;
  }

  let alive = true;
  let activeStream = null;
  let reconnectTimer = null;
  let readyState = 0;
  let lastSequence = Number(handlers.afterSequence || 0);
  try { lastSequence = Math.max(lastSequence, readStoredSseCursor(localStorage, sessionId)); } catch {}
  const base = _cachedBase || BASE_CANDIDATES[0];
  const url = `${base}/api/deliberation/${sessionId}/events`;

  const dispatch = (event) => {
    lastSequence = advanceSseCursor(lastSequence, event);
    try { writeStoredSseCursor(localStorage, sessionId, lastSequence); } catch {}
    onEvent?.(event);
    const payload = event?.data || event?.payload || event;
    if (event?.type === 'ADVISOR_SPEAK') onAdvisorSpeak?.(payload);
    if (event?.type === 'STATE_CHANGE') onStateChange?.(payload);
    if (event?.type === 'OBSERVATION') onObservation?.(payload);
    if (event?.type === 'ERROR') onError?.(payload);
  };

  const connect = (attempt = 0) => {
    if (!alive) return;
    const token = getAccessToken();
    activeStream = openAuthenticatedSse({
      url,
      token,
      afterSequence: lastSequence,
      onEvent: dispatch,
      onOpen: () => {
        readyState = 1;
        onOpen?.();
      },
      onError: async (error) => {
        if (!alive) return;
        if (error?.code === 'AUTH_REQUIRED') {
          const recoveredToken = await recoverDeliberationAuthentication();
          if (!recoveredToken) {
            onError?.(error);
            return;
          }
        } else if (error?.status === 404) {
          onError?.(error);
          return;
        }
      },
      onClose: () => {
        readyState = 2;
        if (!alive) return;
        if (attempt >= 3) {
          onClose?.();
          return;
        }
        const delay = Math.min(8_000, 1_000 * (2 ** attempt));
        reconnectTimer = setTimeout(() => connect(attempt + 1), delay);
      },
    });
  };

  connect();
  return {
    get readyState() { return readyState; },
    close() {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      activeStream?.close();
    },
  };
}

export { _deliberationFetch };
