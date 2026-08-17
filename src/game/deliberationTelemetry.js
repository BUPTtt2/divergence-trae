export function createTelemetryState() {
  return { sessionId: '', phase: '', enteredAt: 0 };
}

export function advancePhaseTelemetry(state = createTelemetryState(), { phase, sessionId, at = Date.now() } = {}) {
  const nextPhase = String(phase || '');
  const nextSessionId = String(sessionId || '');
  if (!nextPhase || !nextSessionId) return { state, events: [] };
  if (state.sessionId === nextSessionId && state.phase === nextPhase) return { state, events: [] };

  const events = [];
  if (state.sessionId === nextSessionId && state.phase && state.enteredAt > 0) {
    events.push({
      event: 'phase_completed',
      properties: { phase: state.phase, durationMs: Math.max(0, at - state.enteredAt) },
    });
  }
  events.push({ event: 'phase_entered', properties: { phase: nextPhase } });
  return {
    state: { sessionId: nextSessionId, phase: nextPhase, enteredAt: at },
    events,
  };
}

export default { advancePhaseTelemetry, createTelemetryState };
