/**
 * EventBus — 事件总线（v2.0 生产级）
 *
 * 所有后端模块通过 emit() 发布事件，EventBus 负责：
 * 1. 写后端日志文件（通过 logger）
 * 2. 持久化到 deliberation_events 表（支持 Session 重放恢复）
 * 3. 推送到前端 SSE（如果前端在监听）
 *
 * 事件类型:
 *   - THOUGHT:       演·思考过程
 *   - ACTION:        演·工具调用
 *   - OBSERVATION:   演·观察结果
 *   - ADVISOR_SPEAK: 智囊发言
 *   - STATE_CHANGE:  状态流转
 *   - ERROR:         错误事件
 *
 * 设计依据: docs/重设.md 第 4 节（EventBus 替代 Blackboard，支持订阅发布+持久化事件流）
 */

import logger from './logger.js';
import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const EVENTS_TABLE = 'deliberation_events';
const SYSTEM_SESSION_ID = 'system';

class EventBus {
  constructor() {
    /** @type {Map<string, import('express').Response[]>} sessionId → SSE connections */
    this.listeners = new Map();
    /** 历史事件缓存（每session最多100条，供新订阅者补看） */
    this.history = new Map();
    const MAX_HISTORY = 100;
    this.MAX_HISTORY = MAX_HISTORY;
  }

  /**
   * 发布事件
   * @param {string} sessionId 推演会话ID（null 表示系统级事件，存为 'system'）
   * @param {{type: string, data: object, actor?: string}} event 事件对象
   */
  emit(sessionId, event) {
    const sid = sessionId || SYSTEM_SESSION_ID;
    const fullEvent = {
      id: generateUUID(),
      type: event.type,
      sessionId: sid,
      data: event.data || {},
      actor: event.actor || null,
      timestamp: new Date().toISOString(),
    };

    // 1. 写后端日志
    const logMsg = `[EventBus] ${fullEvent.type}`;
    const logMeta = { sessionId: sid, ...fullEvent.data };
    if (fullEvent.type === 'ERROR') {
      logger.error(logMsg, logMeta);
    } else if (fullEvent.type === 'THOUGHT' || fullEvent.type === 'STATE_CHANGE') {
      logger.info(logMsg, logMeta);
    } else {
      logger.info(logMsg, logMeta);
    }

    // 2. 缓存历史（供新订阅者补看）
    if (!this.history.has(sid)) this.history.set(sid, []);
    const hist = this.history.get(sid);
    hist.push(fullEvent);
    if (hist.length > this.MAX_HISTORY) hist.shift();

    // 3. 推送到前端 SSE
    const conns = this.listeners.get(sid) || [];
    for (const res of conns) {
      try {
        res.write(`data: ${JSON.stringify(fullEvent)}\n\n`);
      } catch (e) {
        // 连接已断开，忽略
      }
    }

    // 4. 持久化到 DB（异步不阻塞，失败仅告警不抛错）
    this.persistEvent(fullEvent).catch((err) => {
      logger.warn('[EventBus] 事件持久化失败', { sessionId: sid, type: fullEvent.type, error: err.message });
    });
  }

  /**
   * 持久化单条事件到 deliberation_events 表
   * @param {object} fullEvent 完整事件对象
   */
  async persistEvent(fullEvent) {
    await query({
      table: EVENTS_TABLE,
      action: 'insert',
      data: {
        id: fullEvent.id,
        session_id: fullEvent.sessionId,
        type: fullEvent.type,
        payload: JSON.stringify(fullEvent.data),
        actor: fullEvent.actor,
      },
    });
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
      const result = await query({
        table: EVENTS_TABLE,
        action: 'select',
        filter: { session_id: sessionId },
        queryOptions: { orderBy: 'created_at:asc', limit: 200 },
      });
      return (result.rows || []).map((row) => ({
        id: row.id,
        type: row.type,
        sessionId: row.session_id,
        data: typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {}),
        actor: row.actor,
        timestamp: row.created_at,
      }));
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
  async subscribe(sessionId, res) {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, []);
    }
    this.listeners.get(sessionId).push(res);

    // 补发历史事件（让新订阅者看到之前的日志）
    // 优先从内存缓存读，缓存空时从 DB replay
    let hist = this.history.get(sessionId) || [];
    if (hist.length === 0) {
      hist = await this.replay(sessionId);
      if (hist.length > 0) {
        this.history.set(sessionId, hist);
      }
    }
    for (const evt of hist) {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch (e) {}
    }

    logger.info('[EventBus] 前端订阅', { sessionId, connCount: this.listeners.get(sessionId).length, replayCount: hist.length });
  }

  /**
   * 取消订阅
   * @param {string} sessionId
   * @param {import('express').Response} res
   */
  unsubscribe(sessionId, res) {
    const conns = this.listeners.get(sessionId) || [];
    this.listeners.set(sessionId, conns.filter((r) => r !== res));
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
