/**
 * 轻量级前端埋点服务
 * - 队列 + 批量上报（每 5 条或每 30 秒）
 * - 页面隐藏 / beforeunload 时 flush
 * - localStorage 离线缓冲（最多 200 条，溢出丢弃最旧）
 * - 用户可 opt-out（disable()）
 * - 埋点失败不影响主流程（全 try-catch）
 * - 只埋匿名 ID，不埋用户输入内容
 */
import { API_BASE_URL } from './baseConfig.js';

const STORAGE_KEY = 'yance_anonymous_id';
const QUEUE_BUFFER_KEY = 'yance_track_queue';
const OPT_OUT_KEY = 'yance_track_opt_out';
const FLUSH_THRESHOLD = 5;
const FLUSH_INTERVAL_MS = 30000;
const MAX_BUFFER = 200;

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

class Tracker {
  constructor() {
    this.userId = getAnonymousId();
    this.sessionId = generateId();
    this.queue = [];
    this.disabled = false;
    this.flushTimer = null;
    this.flushing = false;

    // 恢复离线缓冲
    this._restoreQueue();

    // 启动定时 flush
    if (typeof window !== 'undefined') {
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
        userId: this.userId,
        sessionId: this.sessionId,
        timestamp: Date.now(),
        properties,
      };
      this.queue.push(entry);
      if (this.queue.length >= FLUSH_THRESHOLD) {
        this.flush();
      }
    } catch (e) {
      // 埋点失败绝不影响主流程
      console.warn('[tracker] track failed', e);
    }
  }

  /**
   * 批量上报到后端 /api/track
   */
  async flush() {
    if (this.flushing || this.disabled || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (!resp.ok) {
        // 上报失败：回填队列，写入 localStorage 缓冲
        this._bufferToStorage(batch);
      }
    } catch (e) {
      // 网络错误：回填到 localStorage 缓冲
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
    try { localStorage.setItem(OPT_OUT_KEY, '1'); } catch { /* ignore */ }
    if (this.flushTimer) clearInterval(this.flushTimer);
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
        message: String(message).slice(0, 500),
        stack: extra.stack ? String(extra.stack).slice(0, 1000) : undefined,
        phase: extra.phase ? String(extra.phase) : undefined,
        userId: this.userId,
        sessionId: this.sessionId,
      });
      // 优先用 sendBeacon（页面卸载也能发出去）
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon(`${API_BASE_URL}/api/track/error`, blob);
        if (ok) return;
      }
      // 降级 fetch
      fetch(`${API_BASE_URL}/api/track/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => { /* ignore */ });
    } catch (e) {
      // 埋点失败绝不影响主流程
      console.warn('[tracker] trackError failed', e);
    }
  }

  /**
   * 开启埋点（用户 opt-in）
   */
  enable() {
    this.disabled = false;
    try { localStorage.removeItem(OPT_OUT_KEY); } catch { /* ignore */ }
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
      // 启动时读取 opt-out
      if (localStorage.getItem(OPT_OUT_KEY) === '1') {
        this.disabled = true;
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
