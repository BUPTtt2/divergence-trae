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
export default tracker;
