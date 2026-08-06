/**
 * costControl.js — 文档20要求：分档路由/prompt缓存/每会话预算/超预算收敛
 * 纯前端MVP版（不用后端路由层），但接口和语义和生产版完全对齐，后续迁平滑
 */

// ============ 预算配置 ============
export const COST_CONFIG = {
  MAX_CHARS_PER_SESSION: 80000,  // 每会话总字符上限≈20k tokens（单session 0.0X美元打住）
  MAX_CHARS_PER_DAY_USER: 400000, // 每用户日帽≈100k tokens
  CACHE_ENABLED: true,            // prompt缓存开关
  CACHE_MAX_ENTRIES: 500,         // 缓存最多500条（防内存爆）
  CACHE_TTL_MS: 1000 * 60 * 60 * 24 * 7, // 缓存保留7天
};

const DAY_KEY = 'divergence_cost_day_v1';
const SESSION_KEY_PREFIX = 'divergence_cost_session_v1_';
const CACHE_KEY = 'divergence_prompt_cache_v1';

const sessionId = (() => {
  try {
    let s = sessionStorage.getItem('divergence_session_id');
    if (!s) {
      s = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('divergence_session_id', s);
    }
    return s;
  } catch {
    return 'sess_' + Date.now().toString(36);
  }
})();
export const getSessionId = () => sessionId;

// 按用户问题+prompt前缀生成稳定hash，命中则直接取结果，不调LLM
export function makeCacheKey(promptType, caseFile, extra = {}) {
  const keyParts = [
    promptType || '',
    caseFile?.question || '',
    caseFile?.keywords?.join(',') || '',
    JSON.stringify(extra).slice(0, 500),
  ];
  // djb2 hash 转成短字符串（不要把整段prompt做key，太长）
  let h = 5381;
  for (let i = 0; i < keyParts.join('').length; i++) {
    h = ((h << 5) + h) + keyParts.join('').charCodeAt(i);
    h |= 0;
  }
  return `${promptType}_${Math.abs(h).toString(36)}`;
}

// 读缓存
export function getCached(cacheKey) {
  if (!COST_CONFIG.CACHE_ENABLED) return null;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry = all[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.savedAt > COST_CONFIG.CACHE_TTL_MS) {
      delete all[cacheKey];
      localStorage.setItem(CACHE_KEY, JSON.stringify(all));
      return null;
    }
    return entry.value;
  } catch { return null; }
}

// 写缓存（带淘汰）
export function setCached(cacheKey, value) {
  if (!COST_CONFIG.CACHE_ENABLED) return false;
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[cacheKey] = { value, savedAt: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > COST_CONFIG.CACHE_MAX_ENTRIES) {
      // 淘汰最旧的20%
      const sorted = keys.sort((a, b) => all[a].savedAt - all[b].savedAt);
      const toRemove = sorted.slice(0, Math.floor(keys.length * 0.2));
      for (const k of toRemove) delete all[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

// ============ 预算计数 ============
export function getSessionBudget() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : { usedChars: 0, callCount: 0, startedAt: Date.now() };
  } catch {
    return { usedChars: 0, callCount: 0, startedAt: Date.now() };
  }
}

export function getDayBudget() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(localStorage.getItem(DAY_KEY) || '{}');
    if (raw.day !== today) return { day: today, usedChars: 0, callCount: 0 };
    return raw;
  } catch {
    return { day: new Date().toISOString().slice(0, 10), usedChars: 0, callCount: 0 };
  }
}

// 记录一次LLM调用的字符数（prompt+response都算）
export function recordCost(promptChars, responseChars) {
  const total = Math.max(0, (promptChars || 0) + (responseChars || 0));
  // session
  try {
    const s = getSessionBudget();
    s.usedChars += total;
    s.callCount += 1;
    sessionStorage.setItem(SESSION_KEY_PREFIX + sessionId, JSON.stringify(s));
  } catch {}
  // day
  try {
    const d = getDayBudget();
    d.usedChars += total;
    d.callCount += 1;
    localStorage.setItem(DAY_KEY, JSON.stringify(d));
  } catch {}
  return total;
}

// 检查是否超预算：返回 { over: boolean, reason?: 'session' | 'day', usedPct }
export function checkBudget() {
  const s = getSessionBudget();
  const d = getDayBudget();
  const sessionPct = Math.min(1, s.usedChars / COST_CONFIG.MAX_CHARS_PER_SESSION);
  const dayPct = Math.min(1, d.usedChars / COST_CONFIG.MAX_CHARS_PER_DAY_USER);
  const usedPct = Math.max(sessionPct, dayPct);
  if (sessionPct >= 1) return { over: true, reason: 'session', usedPct, remaining: 0 };
  if (dayPct >= 1) return { over: true, reason: 'day', usedPct, remaining: 0 };
  const remaining = Math.min(
    COST_CONFIG.MAX_CHARS_PER_SESSION - s.usedChars,
    COST_CONFIG.MAX_CHARS_PER_DAY_USER - d.usedChars,
  );
  return { over: false, usedPct, remaining };
}

// 超预算降级路由：所有后续LLM调用强制切本地兜底，不报错中断流程
export function maybeDowngrade(fnLocalFallback, reason) {
  return {
    shouldDowngrade: true,
    fallback: fnLocalFallback,
    reason,
    tip: reason === 'day'
      ? '今日使用已达上限，已切换至本地推演模式（不调用AI但流程完整）。'
      : '本会话使用已达上限，已切换至本地推演模式。',
  };
}

// 分档路由：简单问题→直接本地兜底（不调LLM）；复杂问题→大档
// 文档01要求：小模型输出过代码阈值才生效（我们这里=代码规则分类直接判简单/复杂）
export function routeModelTier(question, keywords) {
  const q = (question || '').trim();
  const len = q.length;
  // 简单问题：≤30字且关键词少（没有二选/没有时间/没有代价描述）→ 本地兜底，省token
  if (len <= 30 && Array.isArray(keywords) && keywords.length <= 1) {
    // 二选一但短的（要不要A）不算简单
    if (!/(还是|或|或者|vs\.?|二选一)/.test(q) && /(天气|时间|几点|日期|今日|星期)/.test(q)) {
      return { tier: 'local', tip: '简单事实类：直接本地推演，零成本' };
    }
  }
  // 有时间压力+成本关键词（租房/工作/财务等）→复杂问题→大档
  if (/(个月|周|天|截止|代价|承受|预算|工资|房租|贷款|薪资|面试|分手|表白|创业|投资|考研|留学)/.test(q)) {
    return { tier: 'large', tip: '重大决策类：旗舰模型档' };
  }
  // 默认中档
  return { tier: 'medium', tip: '标准决策场景：中档模型档' };
}

export default {
  recordCost, checkBudget, maybeDowngrade, routeModelTier,
  makeCacheKey, getCached, setCached,
  getSessionBudget, getDayBudget,
  COST_CONFIG, getSessionId,
};
