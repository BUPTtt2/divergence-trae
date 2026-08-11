export const RUNTIME_STATUS_EVENT = 'yance:runtime-status';

export function initialRuntimeStatus() {
  return { kind: 'checking', latencyMs: null, checkedAt: 0, failures: 0 };
}

export function deriveRuntimeStatus(previous, event) {
  const current = previous || initialRuntimeStatus();
  const checkedAt = Number(event?.at) || Date.now();
  if (event?.type === 'probe:ok' || event?.type === 'request:ok') {
    return {
      kind: 'online',
      latencyMs: Number.isFinite(event.latencyMs) ? Math.max(0, Math.round(event.latencyMs)) : current.latencyMs,
      checkedAt,
      failures: 0,
    };
  }
  if (event?.type === 'request:start' || event?.type === 'probe:start') {
    return { ...current, kind: 'checking', checkedAt };
  }
  if (event?.type === 'request:error' || event?.type === 'probe:error') {
    const failures = current.failures + 1;
    return { ...current, kind: failures > 1 ? 'offline' : 'degraded', checkedAt, failures };
  }
  return current;
}

export function emitRuntimeStatus(detail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RUNTIME_STATUS_EVENT, { detail: { ...detail, at: detail?.at || Date.now() } }));
}
