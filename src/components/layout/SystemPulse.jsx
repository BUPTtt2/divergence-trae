import { useCallback, useEffect, useReducer, useState } from 'react';
import { API_BASE_URL } from '../../services/baseConfig.js';
import { probeDeliberationHealth } from '../../services/deliberationHealth.js';
import {
  deriveRuntimeStatus,
  emitRuntimeStatus,
  initialRuntimeStatus,
  RUNTIME_STATUS_EVENT,
} from '../../services/runtimeStatus.js';
import './systemPulse.css';

const LABELS = {
  checking: ['推演服务核验中', '正在检查后端连接'],
  online: ['推演服务可连接', '此状态只表示演策后端可访问'],
  degraded: ['推演服务有波动', '最近一次连接未完成'],
  offline: ['推演服务不可连接', '连续连接失败，请稍后重试'],
};

const EXECUTION_LABELS = {
  idle: '尚未核验本次模型执行',
  running: '本次工作执行中',
  model: '本次工作包含模型生成',
  fallback: '本次工作使用规则保底',
  failed: '本次工作尚未完成',
  rate_limited: '本次工作触发容量保护',
};

export default function SystemPulse() {
  const [status, dispatch] = useReducer(deriveRuntimeStatus, undefined, initialRuntimeStatus);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      dispatch({ type: 'probe:error', at: Date.now() });
      return;
    }
    dispatch({ type: 'probe:start', at: Date.now() });
    const startedAt = performance.now();
    const result = await probeDeliberationHealth({ bases: [API_BASE_URL], timeoutMs: 4500 });
    dispatch({
      type: result.ok ? 'probe:ok' : 'probe:error',
      latencyMs: result.ok ? performance.now() - startedAt : null,
      at: Date.now(),
    });
  }, []);

  useEffect(() => {
    const onStatus = (event) => dispatch(event.detail || {});
    const onOnline = () => check();
    const onOffline = () => dispatch({ type: 'probe:error', at: Date.now() });
    window.addEventListener(RUNTIME_STATUS_EVENT, onStatus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    check();
    const timer = window.setInterval(check, 15000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(RUNTIME_STATUS_EVENT, onStatus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [check]);

  const [title, defaultDetail] = LABELS[status.kind] || LABELS.checking;
  const detail = status.reason || defaultDetail;
  const latency = status.latencyMs != null ? `${status.latencyMs} ms` : '—';
  const time = status.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '尚未核验';

  return (
    <div className={`system-pulse system-pulse--${status.kind}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="system-pulse__trigger"
        aria-label={`${title}，点击查看详情`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="system-pulse__dot" aria-hidden="true" />
      </button>
      {open && (
        <div className="system-pulse__panel" role="status">
          <div><span className="system-pulse__mini-dot" /> <strong>{title}</strong></div>
          <p>{detail}</p>
          <p>{EXECUTION_LABELS[status.execution] || EXECUTION_LABELS.idle}</p>
          <dl><div><dt>延迟</dt><dd>{latency}</dd></div><div><dt>核验</dt><dd>{time}</dd></div></dl>
          <button type="button" onClick={() => { emitRuntimeStatus({ type: 'probe:start' }); check(); }}>重新核验</button>
        </div>
      )}
    </div>
  );
}
