import test from 'node:test';
import assert from 'node:assert/strict';

import { advancePhaseTelemetry, createTelemetryState } from './deliberationTelemetry.js';

test('restoring the same phase does not emit a second phase entry', () => {
  const state = createTelemetryState();
  const first = advancePhaseTelemetry(state, { phase: 'input', sessionId: 's1', at: 10 });
  assert.deepEqual(first.events, [{ event: 'phase_entered', properties: { phase: 'input' } }]);
  const restored = advancePhaseTelemetry(first.state, { phase: 'input', sessionId: 's1', at: 20 });
  assert.deepEqual(restored.events, []);
});

test('phase transitions record the completed phase duration and final completion once', () => {
  const first = advancePhaseTelemetry(createTelemetryState(), { phase: 'summary', sessionId: 's1', at: 100 });
  const final = advancePhaseTelemetry(first.state, { phase: 'final', sessionId: 's1', at: 250 });
  assert.deepEqual(final.events, [
    { event: 'phase_completed', properties: { phase: 'summary', durationMs: 150 } },
    { event: 'phase_entered', properties: { phase: 'final' } },
  ]);
  assert.deepEqual(advancePhaseTelemetry(final.state, { phase: 'final', sessionId: 's1', at: 500 }).events, []);
});
