/**
 * LogPanel — 前端日志面板（浮层）
 *
 * 功能:
 * 1. 右下角浮动按钮，点击展开日志面板
 * 2. 通过 SSE (EventSource) 实时接收后端事件
 * 3. 渲染事件列表（时间 + 类型 + 内容）
 * 4. 一键复制全部日志（方便用户发给AI排查）
 *
 * 事件类型渲染:
 *   THOUGHT  → 演·思考（金色）
 *   ACTION   → 演·工具调用（蓝色）
 *   OBSERVATION → 演·观察（绿色）
 *   ADVISOR_SPEAK → 智囊发言（紫色）
 *   STATE_CHANGE → 状态流转（灰色）
 *   ERROR    → 错误（红色）
 *
 * 设计依据: docs/GRAND_REDESIGN.md 6.2 节
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeDeliberationStream } from '../services/deliberationClient';

const TYPE_CONFIG = {
  CONNECTED: { label: '连接', color: '#808080', icon: '◉' },
  THOUGHT: { label: '演·思考', color: '#F0D890', icon: '◈' },
  ACTION: { label: '演·行动', color: '#80B8F0', icon: '⚡' },
  OBSERVATION: { label: '演·观察', color: '#80F0B8', icon: '◎' },
  ADVISOR_SPEAK: { label: '智囊', color: '#D8A8F0', icon: '◆' },
  STATE_CHANGE: { label: '状态', color: '#A0A0A0', icon: '→' },
  ERROR: { label: '错误', color: '#F08080', icon: '✕' },
};

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return '--:--:--';
  }
}

function formatEventData(type, data) {
  const d = data || {};
  switch (type) {
    case 'THOUGHT':
      return d.thought || d.step || JSON.stringify(d);
    case 'ACTION':
      return `${d.tool || '未知工具'}: ${d.result || d.summary || JSON.stringify(d.args || {})}`;
    case 'OBSERVATION':
      return d.insight || d.summary || JSON.stringify(d);
    case 'ADVISOR_SPEAK':
      return `${d.agentName || d.agentId || '智囊'}(${d.stance || '?'}): ${(d.content || '').slice(0, 80)}`;
    case 'STATE_CHANGE':
      return `${d.from || '?'} → ${d.to || '?'}`;
    case 'ERROR':
      return d.error || d.message || JSON.stringify(d);
    case 'CONNECTED':
      return `已连接到推演会话 ${d.sessionId || ''}`;
    default:
      return JSON.stringify(d).slice(0, 120);
  }
}

export default function LogPanel({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const eventSourceRef = useRef(null);
  const listRef = useRef(null);

  // 建立 SSE 连接 —— 改用 subscribeDeliberationStream (内置后端 Fallback 链 + 本地端口3001兜底)
  useEffect(() => {
    // 本地兜底 session（ls_前缀）：后端没有这个 session，不连 SSE，只显示提示日志
    if (!sessionId) {
      setEvents([]);
      return;
    }

    if (sessionId.startsWith('ls_')) {
      setEvents([{
        type: 'CONNECTED',
        data: { sessionId, note: '本地启发式推演模式，无后端事件流' },
        timestamp: new Date().toISOString(),
      }, {
        type: 'THOUGHT',
        data: { thought: '当前为本地兜底推演：后端连接异常，演已按本地规则生成追问与智囊。' },
        timestamp: new Date().toISOString(),
      }, {
        type: 'STATE_CHANGE',
        data: { from: 'input', to: 'clarify_or_summon' },
        timestamp: new Date().toISOString(),
      }]);
      return;
    }

    const stream = subscribeDeliberationStream(sessionId, (evt) => {
      // subscribeDeliberationStream 回调结构: { type, data, timestamp? }
      const normalized = {
        type: evt.type || 'UNKNOWN',
        data: evt.data || {},
        timestamp: evt.timestamp || new Date().toISOString(),
      };
      setEvents((prev) => [...prev, normalized].slice(-200)); // 最多保留200条
    });

    // 初始: 推送一条 CONNECTED 事件让日志面板有第一行（ls_模式已在上面单独设置，这里跳过）
    if (!sessionId.startsWith('ls_')) {
      setEvents((prev) => [
        ...prev,
        { type: 'CONNECTED', data: { sessionId }, timestamp: new Date().toISOString() },
      ].slice(-200));
    }

    return () => {
      stream.close();
    };
  }, [sessionId]);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current && open) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events, open]);

  const handleCopy = useCallback(() => {
    const text = events
      .map((e) => `[${formatTime(e.timestamp)}] ${e.type}: ${formatEventData(e.type, e.data)}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      // 复制成功提示
      const btn = document.getElementById('log-copy-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }
    });
  }, [events]);

  // 未连接 session 时不显示按钮
  if (!sessionId) return null;

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 9999,
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          border: `1px solid #C8A850`,
          background: open ? 'rgba(200,168,80,0.2)' : 'rgba(26,20,16,0.85)',
          color: '#F0D890',
          fontSize: '18px',
          cursor: 'pointer',
          boxShadow: '0 0 12px rgba(200,168,80,0.3)',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="推演日志"
      >
        {open ? '✕' : '📜'}
        {events.length > 0 && !open && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            background: '#C8A850',
            color: '#1A1410',
            fontSize: '10px',
            borderRadius: '8px',
            padding: '1px 5px',
            fontWeight: 'bold',
          }}>
            {events.length}
          </span>
        )}
      </button>

      {/* 日志面板浮层 */}
      {open && (
        <div
          style={{
            position: 'fixed',
            right: '20px',
            bottom: '74px',
            zIndex: 9998,
            width: '420px',
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: '60vh',
            background: 'rgba(26,20,16,0.96)',
            border: '1px solid rgba(200,168,80,0.4)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 标题栏 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(200,168,80,0.2)',
            background: 'rgba(200,168,80,0.06)',
          }}>
            <span style={{
              color: '#F0D890',
              fontSize: '12px',
              letterSpacing: '0.15em',
              fontFamily: '"Noto Serif SC", serif',
            }}>
              演 · 推演日志 ({events.length})
            </span>
            <button
              id="log-copy-btn"
              onClick={handleCopy}
              style={{
                background: 'transparent',
                border: '1px solid rgba(200,168,80,0.4)',
                color: '#C8A850',
                fontSize: '11px',
                padding: '2px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              复制
            </button>
          </div>

          {/* 日志列表 */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 14px',
              fontFamily: '"SF Mono", "Menlo", monospace',
              fontSize: '11px',
              lineHeight: 1.7,
            }}
          >
            {events.length === 0 ? (
              <div style={{ color: '#605850', textAlign: 'center', padding: '20px' }}>
                等待推演事件...
              </div>
            ) : (
              events.map((evt, i) => {
                const cfg = TYPE_CONFIG[evt.type] || { label: evt.type, color: '#A0A0A0', icon: '·' };
                const text = formatEventData(evt.type, evt.data);
                return (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    marginBottom: '4px',
                    paddingBottom: '4px',
                    borderBottom: i < events.length - 1 ? '1px dashed rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <span style={{ color: '#605850', marginRight: '8px', flexShrink: 0, fontSize: '10px' }}>
                      {formatTime(evt.timestamp)}
                    </span>
                    <span style={{ color: cfg.color, marginRight: '6px', flexShrink: 0 }}>
                      {cfg.icon}
                    </span>
                    <span style={{ color: cfg.color, marginRight: '6px', flexShrink: 0, fontSize: '10px' }}>
                      {cfg.label}
                    </span>
                    <span style={{ color: '#C0B8A8', wordBreak: 'break-word' }}>
                      {text}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
