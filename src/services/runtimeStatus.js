export const RUNTIME_STATUS_EVENT = 'yance:runtime-status';

export function initialRuntimeStatus() {
  return {
    kind: 'checking',
    service: 'checking',
    execution: 'idle',
    provenance: 'unknown',
    latencyMs: null,
    checkedAt: 0,
    failures: 0,
    reason: '',
  };
}

function reachable(current, event, checkedAt) {
  return {
    ...current,
    kind: 'online',
    service: 'reachable',
    latencyMs: Number.isFinite(event.latencyMs) ? Math.max(0, Math.round(event.latencyMs)) : current.latencyMs,
    checkedAt,
    failures: 0,
    reason: '',
  };
}

function executionKind(provenance) {
  if (provenance === 'model') return 'model';
  if (/fallback|rule/i.test(String(provenance || ''))) return 'fallback';
  return 'idle';
}

export function deriveRuntimeStatus(previous, event) {
  const current = previous || initialRuntimeStatus();
  const checkedAt = Number(event?.at) || Date.now();
  if (event?.type === 'probe:ok') {
    return reachable(current, event, checkedAt);
  }
  if (event?.type === 'probe:start') {
    return { ...current, kind: current.service === 'reachable' ? 'online' : 'checking', service: current.service === 'reachable' ? 'reachable' : 'checking', checkedAt };
  }
  if (event?.type === 'request:start') {
    return { ...current, execution: 'running', checkedAt };
  }
  if (event?.type === 'request:ok') {
    return { ...reachable(current, event, checkedAt), execution: 'idle' };
  }
  if (event?.type === 'request:error' || event?.type === 'probe:error') {
    const failures = current.failures + 1;
    return {
      ...current,
      kind: failures > 1 ? 'offline' : 'degraded',
      service: failures > 1 ? 'unreachable' : 'degraded',
      execution: event.type === 'request:error' ? 'failed' : current.execution,
      checkedAt,
      failures,
    };
  }
  if (event?.type === 'work:stalled') {
    return {
      ...current,
      execution: 'failed',
      checkedAt,
      reason: event.reason || '推演等待智囊响应超时',
    };
  }
  if (event?.type === 'work:progress') {
    const provenance = event.provenance || 'unknown';
    return { ...reachable(current, event, checkedAt), execution: executionKind(provenance), provenance };
  }
  if (event?.type === 'work:rate-limited') {
    return { ...current, execution: 'rate_limited', checkedAt, reason: event.reason || '本次模型容量已达安全上限' };
  }
  return current;
}

export function emitRuntimeStatus(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RUNTIME_STATUS_EVENT, { detail: { ...detail, at: detail?.at || Date.now() } }));
}
