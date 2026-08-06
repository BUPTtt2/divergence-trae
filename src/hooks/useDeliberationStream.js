/**
 * useDeliberationStream — 订阅后端推演事件流（SSE）
 *
 * 职责：
 * 1. 拿到 sessionId 后建立 EventSource 订阅
 * 2. 把后端事件分类回调给调用方
 * 3. 提供 pause/resume 控制
 * 4. 组件卸载或 sessionId 变空时自动关闭
 *
 * 事件类型对齐 server/src/services/eventBus.js：
 *   - THOUGHT (yan.thinking)
 *   - ADVISOR_SPEAK (zhiguan.spoke)
 *   - STATE_CHANGE
 *   - OBSERVATION
 *   - ERROR
 *   - CONNECTED (初始连接确认)
 *
 * 依据: docs/重设.md 第 8 节（流式 SSE + 取消 + 恢复）
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  subscribeDeliberationStream,
  pauseStream as pauseDeliberation,
  resumeStream as resumeDeliberationStream,
} from '../services/deliberationClient';

/**
 * @param {string|null} sessionId 推演会话ID，null 时不订阅
 * @param {object} callbacks 回调集合
 * @param {(data:{step?,thought?}) => void} [callbacks.onThought] 演·思考
 * @param {(data:{agentId?,agentName?,stance?,content?}) => void} [callbacks.onAdvisorSpeak] 智囊发言
 * @param {(data:{from?,to?,reason?}) => void} [callbacks.onStateChange] 状态流转
 * @param {(data:{insight?}) => void} [callbacks.onObservation] 演·观察
 * @param {(data:{error?}) => void} [callbacks.onError] 错误
 * @param {() => void} [callbacks.onConnected] SSE 连接建立
 * @returns {{ paused: boolean, pause: () => void, resume: () => Promise<void>, close: () => void }}
 */
export function useDeliberationStream(sessionId, callbacks = {}) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const streamRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // 本地兜底 session（ls_前缀）是纯前端生成的，后端没有这个 session，事件流一定 404 → ERROR → 全屏异常
    if (!sessionId || sessionId.startsWith('ls_')) {
      setConnected(false);
      return;
    }

    // 建立订阅
    const stream = subscribeDeliberationStream(sessionId, (evt) => {
      const { type, data } = evt;
      const cb = cbRef.current;

      switch (type) {
        case 'CONNECTED':
          setConnected(true);
          cb.onConnected?.();
          break;
        case 'THOUGHT':
          cb.onThought?.(data || {});
          break;
        case 'ADVISOR_SPEAK':
          cb.onAdvisorSpeak?.(data || {});
          break;
        case 'STATE_CHANGE':
          // 自动跟踪 PAUSED 状态
          if (data?.to === 'PAUSED') setPaused(true);
          if (data?.from === 'PAUSED') setPaused(false);
          cb.onStateChange?.(data || {});
          break;
        case 'OBSERVATION':
          cb.onObservation?.(data || {});
          break;
        case 'ERROR':
          cb.onError?.(data || {});
          break;
        default:
          break;
      }
    });

    streamRef.current = stream;

    return () => {
      stream.close();
      streamRef.current = null;
      setConnected(false);
    };
  }, [sessionId]);

  const pause = useCallback((reason = 'user_paused') => {
    if (!sessionId) return;
    setPaused(true);
    pauseDeliberation(sessionId).catch(() => {});
  }, [sessionId]);

  const resume = useCallback(async () => {
    if (!sessionId) return;
    try {
      await resumeDeliberationStream(sessionId);
      setPaused(false);
    } catch (e) {
      console.warn('[useDeliberationStream] resume 失败:', e.message);
      throw e;
    }
  }, [sessionId]);

  const close = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setConnected(false);
  }, []);

  return { paused, connected, pause, resume, close };
}

export default useDeliberationStream;
