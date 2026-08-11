import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDeliberationUsage } from '../../services/apiClient.js';
import { buildSessionMeasurement } from './buildSessionMeasurement.js';
import './sessionMeasurement.css';

const storageKey = (sessionId) => `yance_session_started_at:${sessionId}`;

const PHASE_LABELS = {
  casting: '立卦',
  yan_analyze: '析问',
  clarify_loop: '请智',
  agent_debate: '机理',
  summary: '决择',
  reflecting: '定论',
  final: '归档',
};

function readStartedAt(sessionId) {
  if (!sessionId || typeof window === 'undefined') return Date.now();
  const key = storageKey(sessionId);
  const stored = Number(window.sessionStorage.getItem(key));
  if (Number.isFinite(stored) && stored > 0) return stored;
  const startedAt = Date.now();
  window.sessionStorage.setItem(key, String(startedAt));
  return startedAt;
}

export default function SessionMeasurement({ sessionId, phase, artwork }) {
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(() => readStartedAt(sessionId));
  const [now, setNow] = useState(Date.now());
  const [usageSummary, setUsageSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    setStartedAt(readStartedAt(sessionId));
    setNow(Date.now());
    setUsageSummary(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  const refresh = useCallback(async () => {
    if (!sessionId || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await getDeliberationUsage(sessionId);
      setUsageSummary(result?.summary || null);
    } catch {
      setUsageSummary(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, phase, refresh]);

  const measurement = useMemo(() => buildSessionMeasurement({
    elapsedMs: now - startedAt,
    usageSummary,
    artwork,
  }), [now, startedAt, usageSummary, artwork]);

  if (!sessionId) return null;
  return (
    <div className={`session-measurement${open ? ' is-open' : ''}`}>
      <button type="button" className="session-measurement__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <small>本局实测</small><strong>{measurement.elapsed}</strong>
      </button>
      {open && <section className="session-measurement__panel" aria-label="本局实测计量">
        <header><strong>一轮实测计量</strong><button type="button" onClick={refresh} disabled={loading}>{loading ? '核对中' : '刷新'}</button></header>
        <dl>
          <div><dt>当前阶段</dt><dd>{PHASE_LABELS[phase] || '建立会话'}</dd></div>
          <div><dt>已用时间</dt><dd>{measurement.elapsed}</dd></div>
          <div><dt>模型请求</dt><dd>{usageSummary ? `${measurement.calls} 次` : '展开后核对'}</dd></div>
          <div><dt>失败请求</dt><dd>{usageSummary ? `${measurement.failedCalls} 次` : '—'}</dd></div>
          <div><dt>模型 Token</dt><dd>{measurement.tokens == null ? '供应商账单为准' : measurement.tokens.toLocaleString('zh-CN')}</dd></div>
          <div><dt>命牌画面</dt><dd>{measurement.image}</dd></div>
        </dl>
        <p>这里只记录本局链路；最终扣费以火山方舟用量统计为准。</p>
      </section>}
    </div>
  );
}
