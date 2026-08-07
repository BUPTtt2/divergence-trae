/**
 * EventBus — AgentEventV1 分发总线
 *
 * 所有后端模块通过 emit() 发布事件，EventBus 负责：
 * 1. 写后端日志文件（通过 logger）
 * 2. 把规范化事件委托给 EventStore 单次持久化
 * 3. 只把 public/summary 事件推送到前端 SSE
 *
 * 旧 THOUGHT/ACTION 等事件仅作内部兼容；浏览器业务语义使用版本化领域事件。
 */

import logger from './logger.js';
import { generateUUID } from '../utils/id.js';
import { appendEvent, getEvents, isBrowserVisibleEvent, withLegacyAliases } from './eventStore.js';
const SYSTEM_SESSION_ID = 'system';

class EventBus {
  constructor() {
    /** @type {Map<string, Array<{res: import('express').Response, lastSentSequence: number, replaying: boolean, pending: object[]}>>} */
    this.listeners = new Map();
    /** 历史事件缓存（每 session 最多 100 条，仅供进程内诊断；SSE 重放始终分页读库） */
    this.history = new Map();
    /** @type {Map<string, Set<(event: object) => void>>} event type → backend subscribers */
    this.backendListeners = new Map();
    const MAX_HISTORY = 100;
    this.MAX_HISTORY = MAX_HISTORY;
  }

  /**
   * 订阅某一类后端事件。返回取消订阅函数。
   * SSE 连接仍使用 subscribe(sessionId, res)，两种监听不混用。
   */
  on(type, handler) {
    if (!type || typeof handler !== 'function') {
      throw new TypeError('EventBus.on requires an event type and handler');
    }
    if (!this.backendListeners.has(type)) this.backendListeners.set(type, new Set());
    const handlers = this.backendListeners.get(type);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.backendListeners.delete(type);
    };
  }

  /**
   * 发布事件
   * @param {string} sessionId 推演会话ID（null 表示系统级事件，存为 'system'）
   * @param {{type: string, data: object, actor?: string}} event 事件对象
   */
  emit(sessionId, event) {
    const sid = sessionId || SYSTEM_SESSION_ID;
    const eventId = generateUUID();
    const draft = withLegacyAliases({
      eventId,
      type: event.type,
      sessionId: sid,
      sequence: 0,
      actorId: event.actorId || event.actor || 'system',
      ...(event.taskId ? { taskId: event.taskId } : {}),
      ...(event.causationId ? { causationId: event.causationId } : {}),
      correlationId: event.correlationId || event.data?.correlationId || `corr_${eventId}`,
      payload: event.payload || event.data || {},
      visibility: event.visibility || 'public',
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    });

    // 1. 写后端日志
    const logMsg = `[EventBus] ${draft.type}`;
    const logMeta = { sessionId: sid, ...draft.payload };
    if (draft.type === 'ERROR') {
      logger.error(logMsg, logMeta);
    } else if (draft.type === 'THOUGHT' || draft.type === 'STATE_CHANGE') {
      logger.info(logMsg, logMeta);
    } else {
      logger.info(logMsg, logMeta);
    }

    // 后端审计依赖同步通知；事件对象会在持久化后补齐正式 sequence。
    const handlers = this.backendListeners.get(draft.type) || [];
    for (const handler of handlers) {
      try {
        handler(draft);
      } catch (error) {
        logger.warn('[EventBus] 后端订阅者异常', { type: draft.type, error: error.message });
      }
    }

    const persistedPromise = appendEvent(sid, draft.type, draft.payload, draft.actorId, {
      eventId: draft.eventId,
      createdAt: draft.createdAt,
      taskId: draft.taskId,
      causationId: draft.causationId,
      correlationId: draft.correlationId,
      visibility: event.visibility,
    }).then((persisted) => {
      Object.assign(draft, persisted);
      if (!this.history.has(sid)) this.history.set(sid, []);
      const history = this.history.get(sid);
      history.push(persisted);
      if (history.length > this.MAX_HISTORY) history.shift();
      if (isBrowserVisibleEvent(persisted)) {
        const conns = this.listeners.get(sid) || [];
        for (const listener of conns) {
          if (listener.replaying) {
            listener.pending.push(persisted);
            continue;
          }
          if (persisted.sequence <= listener.lastSentSequence) continue;
          try {
            listener.res.write(`id: ${persisted.sequence}\ndata: ${JSON.stringify(persisted)}\n\n`);
            listener.lastSentSequence = persisted.sequence;
          } catch {}
        }
      }
      return persisted;
    });
    // 大量领域事件允许 fire-and-forget；附加观察器避免无人 await 时形成未处理拒绝。
    // 调用方若显式 await，仍会收到原 Promise 的失败并可决定是否中止业务。
    persistedPromise.catch((error) => {
      logger.warn('[EventBus] 事件持久化失败', { sessionId: sid, type: draft.type, error: error.message });
    });
    return persistedPromise;
  }

  /**
   * 重放：从 DB 读取 session 的所有事件（按时间正序）
   * 用于 Session 断点恢复、调试轨迹查询
   * @param {string} sessionId
   * @returns {Promise<Array>} 事件数组（按 created_at 正序）
   */
  async replay(sessionId) {
    if (!sessionId) return [];
    try {
      return await getEvents(sessionId);
    } catch (e) {
      logger.warn('[EventBus] replay 读取失败', { sessionId, error: e.message });
      // 降级：返回内存缓存
      return this.history.get(sessionId) || [];
    }
  }

  /**
   * 前端订阅某个 session 的事件流（SSE）
   * @param {string} sessionId
   * @param {import('express').Response} res Express Response (SSE)
   */
  async subscribe(sessionId, res, options = {}) {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, []);
    }
    const afterSequence = Number(options.afterSequence || 0);
    const listener = { res, lastSentSequence: afterSequence, replaying: true, pending: [] };
    this.listeners.get(sessionId).push(listener);

    let cursor = afterSequence;
    let replayCount = 0;
    try {
      while (true) {
        const page = await getEvents(sessionId, { afterSequence: cursor, limit: 200 });
        if (page.length === 0) break;
        for (const event of page) {
          cursor = Math.max(cursor, event.sequence);
          if (!isBrowserVisibleEvent(event) || event.sequence <= listener.lastSentSequence) continue;
          try {
            res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
            listener.lastSentSequence = event.sequence;
            replayCount += 1;
          } catch {}
        }
        if (page.length < 200) break;
      }
    } finally {
      const pending = listener.pending.sort((left, right) => left.sequence - right.sequence);
      for (const event of pending) {
        cursor = Math.max(cursor, event.sequence);
        if (!isBrowserVisibleEvent(event) || event.sequence <= listener.lastSentSequence) continue;
        try {
          res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
          listener.lastSentSequence = event.sequence;
        } catch {}
      }
      listener.pending = [];
      listener.replaying = false;
    }
    try {
      res.write(`data: ${JSON.stringify({ type: 'REPLAY_COMPLETE', sessionId, lastSequence: cursor })}\n\n`);
    } catch {}

    logger.info('[EventBus] 前端订阅', { sessionId, connCount: this.listeners.get(sessionId).length, replayCount, afterSequence });
  }

  /**
   * 取消订阅
   * @param {string} sessionId
   * @param {import('express').Response} res
   */
  unsubscribe(sessionId, res) {
    const conns = this.listeners.get(sessionId) || [];
    this.listeners.set(sessionId, conns.filter((listener) => listener.res !== res));
    logger.info('[EventBus] 前端取消订阅', { sessionId, remainingConns: this.listeners.get(sessionId).length });
  }

  /**
   * 清理 session 的所有监听和历史（推演结束后调用）
   * 注意：不清理 DB 事件流，保留供后续重放/审计
   * @param {string} sessionId
   */
  cleanup(sessionId) {
    this.listeners.delete(sessionId);
    this.history.delete(sessionId);
  }
}

export default new EventBus();
