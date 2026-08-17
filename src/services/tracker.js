/**
 * 轻量级前端埋点服务
 * - 队列 + 批量上报（每 5 条或每 30 秒）
 * - 页面隐藏 / beforeunload 时 flush
 * - localStorage 离线缓冲（最多 200 条，溢出丢弃最旧）
 * - 用户可 opt-out（disable()）
 * - 埋点失败不影响主流程（全 try-catch）
 * - 只埋匿名 ID，不埋用户输入内容
 */
import { API_BASE_URL, getAccessTokenSync } from './baseConfig.js';

const STORAGE_KEY = 'yance_anonymous_id';
const QUEUE_BUFFER_KEY = 'yance_track_queue';
const OPT_OUT_KEY = 'yance_track_opt_out';
const FLUSH_THRESHOLD = 5;
const FLUSH_INTERVAL_MS = 30000;
const MAX_BUFFER = 200;

const CLIENT_PROPERTY_KEYS = new Set([
  'agentId', 'cardId', 'durationMs', 'errorCode', 'fallbackType', 'feedbackId',
  'helpfulness', 'model', 'offline', 'page', 'phase', 'provider', 'retryCount',
  'shareChannel', 'source', 'storageMode', 'success', 'summaryLen', 'tags',
  'usageAvailable', 'value', 'withOutcome', 'gua',
  'styleId', 'persistent', 'includedCredit',
]);

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sanitizeTrackingProperties(properties = {}) {
  return Object.fromEntries(Object.entries(properties).filter(([key, value]) => (
    CLIENT_PROPERTY_KEYS.has(key)
    && value !== undefined
    && value !== null
    && ['string', 'number', 'boolean'].includes(typeof value)
  )).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 120) : value]));
}

export function createTrackingContext({
  width = typeof window !== 'undefined' ? window.innerWidth : 1200,
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  search = typeof window !== 'undefined' ? window.location.search : '',
  releaseId = import.meta.env?.VITE_RELEASE_ID || '',
} = {}) {
  const ua = String(userAgent).toLowerCase();
  const isIPad = /ipad/.test(ua) || (/macintosh/.test(ua) && /mobile/.test(ua));
  const deviceClass = isIPad || (width >= 700 && width < 1100) ? 'tablet' : width < 700 ? 'mobile' : 'desktop';
  const platformFamily = /iphone|ipad/.test(ua) ? 'ios-safari'
    : /android/.test(ua) ? 'android'
      : /mac os|macintosh/.test(ua) ? 'macos'
        : /windows/.test(ua) ? 'windows' : 'other';
  return {
    mode: new URLSearchParams(search).get('kiosk') === '1' ? 'kiosk' : 'standard',
    deviceClass,
    platformFamily,
    releaseId: String(releaseId || '').slice(0, 80),
  };
}

export function normalizeErrorCode(message = '') {
  const normalized = String(message).toLowerCase();
  if (normalized.includes('timeout') || normalized.includes('timed out')) return 'TIMEOUT';
  if (normalized.includes('network') || normalized.includes('fetch')) return 'NETWORK_ERROR';
  if (normalized.includes('abort')) return 'ABORTED';
  return 'CLIENT_RUNTIME_ERROR';
}

function getAnonymousId() {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = `anon-${generateId()}`;
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `anon-${generateId()}`;
  }
}

export function clearTrackingState(storage, queue = []) {
  queue.splice(0, queue.length);
  storage?.removeItem?.(QUEUE_BUFFER_KEY);
  storage?.removeItem?.(STORAGE_KEY);
}

function isTrackingOptedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; }
}

class Tracker {
  constructor() {
    const optedOut = isTrackingOptedOut();
    this.userId = optedOut ? '' : getAnonymousId();
    this.analyticsSessionId = generateId();
    this.deliberationSessionId = '';
    this.context = createTrackingContext();
    this.queue = [];
    this.disabled = optedOut;
    this.flushTimer = null;
    this.flushing = false;

    // 恢复离线缓冲
    if (this.disabled) {
      try { clearTrackingState(localStorage, this.queue); } catch { this.queue.length = 0; }
    } else {
      this._restoreQueue();
    }

    // 启动定时 flush
    if (typeof window !== 'undefined' && !this.disabled) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
      window.addEventListener('beforeunload', this._handleUnload);
      window.addEventListener('pagehide', this._handleUnload);
    }
  }

  /**
   * 上报一个事件
   * @param {string} event - 事件名
   * @param {Object} properties - 事件属性（不含敏感内容）
   */
  track(event, properties = {}) {
    if (this.disabled) return;
    try {
      const entry = {
        event,
        analyticsSessionId: this.analyticsSessionId,
        deliberationSessionId: this.deliberationSessionId,
        timestamp: Date.now(),
        properties: sanitizeTrackingProperties(properties),
        ...this.context,
      };
      this.queue.push(entry);
      if (this.queue.length >= FLUSH_THRESHOLD) {
        this.flush();
      }
    } catch (error) {
      // 埋点失败绝不影响主流程
      console.warn('[tracker] track failed', error);
    }
  }

  setDeliberationSession(sessionId = '') {
    this.deliberationSessionId = String(sessionId || '').slice(0, 120);
  }

  /**
   * 批量上报到后端 /api/track
   */
  async flush() {
    if (this.flushing || this.disabled || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const body = JSON.stringify({ events: batch });
      const trackUrl = `${API_BASE_URL}/api/track`;
      const isSameOrigin = (() => {
        try {
          if (!trackUrl.startsWith('http')) return true;
          const u = new URL(trackUrl, window.location.href);
          return u.origin === window.location.origin;
        } catch { return false; }
      })();
      const accessToken = getAccessTokenSync();
      if (!accessToken) {
        this._bufferToStorage(batch);
        return;
      }
      const resp = await fetch(trackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body,
        keepalive: isSameOrigin,
      });
      if (!resp.ok) {
        this._bufferToStorage(batch);
      }
    } catch {
      // 所有网络错误（含 ERR_ABORTED / sendBeacon 失败）统一缓冲到 localStorage，不打 error
      this._bufferToStorage(batch);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * 关闭埋点（用户 opt-out）
   */
  disable() {
    this.disabled = true;
    try {
      localStorage.setItem(OPT_OUT_KEY, '1');
      clearTrackingState(localStorage, this.queue);
      this.userId = '';
    } catch { this.queue.length = 0; }
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  prepareForHandoff() {
    this.disabled = true;
    this.flushing = false;
    try {
      clearTrackingState(localStorage, this.queue);
      this.userId = '';
    } catch { this.queue.length = 0; }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * 上报关键错误（同步 sendBeacon，页面崩溃也能发出去）
   * @param {string} message - 错误消息
   * @param {Object} extra - 额外信息 { stack, phase, ... }
   */
  trackError(message, extra = {}) {
    if (this.disabled) return;
    try {
      const payload = JSON.stringify({
        message: normalizeErrorCode(message),
        phase: extra.phase ? String(extra.phase) : undefined,
        analyticsSessionId: this.analyticsSessionId,
        deliberationSessionId: this.deliberationSessionId,
        ...this.context,
      });
      const errUrl = `${API_BASE_URL}/api/track/error`;
      const isSameOrigin = (() => {
        try {
          if (!errUrl.startsWith('http')) return true;
          const u = new URL(errUrl, window.location.href);
          return u.origin === window.location.origin;
        } catch { return false; }
      })();
      const accessToken = getAccessTokenSync();
      if (!accessToken) return;
      fetch(errUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: payload,
        keepalive: isSameOrigin,
      }).catch(() => { /* ignore */ });
    } catch {
      // 埋点失败绝不影响主流程
    }
  }

  /**
   * 开启埋点（用户 opt-in）
   */
  enable() {
    this.disabled = false;
    try { localStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ }
    if (!this.userId) this.userId = getAnonymousId();
    if (typeof window !== 'undefined' && !this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  _handleUnload = () => {
    try {
      this.flush();
    } catch { /* ignore */ }
  };

  _bufferToStorage(batch) {
    if (this.disabled) return;
    try {
      const existing = JSON.parse(localStorage.getItem(QUEUE_BUFFER_KEY) || '[]');
      const merged = [...existing, ...batch];
      // 溢出丢弃最旧
      if (merged.length > MAX_BUFFER) {
        merged.splice(0, merged.length - MAX_BUFFER);
      }
      localStorage.setItem(QUEUE_BUFFER_KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
  }

  _restoreQueue() {
    try {
      const buffered = JSON.parse(localStorage.getItem(QUEUE_BUFFER_KEY) || '[]');
      if (buffered.length > 0) {
        this.queue.push(...buffered);
        localStorage.removeItem(QUEUE_BUFFER_KEY);
      }
    } catch { /* ignore */ }
  }
}

export const tracker = new Tracker();

/**
 * Web Vitals 性能监控（LCP/CLS/INP）
 * 使用浏览器原生 PerformanceObserver，无额外依赖
 * 采集后通过 tracker.track 上报，用于上线后性能优化决策
 */
export function initWebVitals() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  try {
    // LCP (Largest Contentful Paint) - 最大内容绘制时间
    let lcpValue = 0;
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      lcpValue = lastEntry.startTime;
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    // 页面隐藏时上报 LCP
    window.addEventListener('pagehide', () => {
      if (lcpValue > 0) {
        tracker.track('web_vital_lcp', { value: Math.round(lcpValue), page: location.pathname });
      }
    }, { once: true });

    // CLS (Cumulative Layout Shift) - 累积布局偏移
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
    window.addEventListener('pagehide', () => {
      if (clsValue > 0) {
        tracker.track('web_vital_cls', { value: Number(clsValue.toFixed(4)), page: location.pathname });
      }
    }, { once: true });

    // INP (Interaction to Next Paint) - 交互到下次绘制
    let maxInp = 0;
    const inpObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const duration = entry.duration;
        if (duration > maxInp) maxInp = duration;
      }
    });
    inpObserver.observe({ type: 'event', buffered: true });
    window.addEventListener('pagehide', () => {
      if (maxInp > 0) {
        tracker.track('web_vital_inp', { value: Math.round(maxInp), page: location.pathname });
      }
    }, { once: true });
  } catch (e) {
    console.warn('[tracker] Web Vitals init failed', e);
  }
}

export default tracker;
