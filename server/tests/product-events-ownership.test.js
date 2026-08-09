import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function call(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test('product telemetry is persisted under the signed principal and isolated by owner', async () => {
  await withServer(async (base) => {
    const owner = await call(base, '/api/auth/anonymous', { method: 'POST', body: {} });
    const intruder = await call(base, '/api/auth/anonymous', { method: 'POST', body: {} });
    const tracked = await call(base, '/api/track', {
      method: 'POST',
      token: owner.body.accessToken,
      body: { events: [{ event: 'phase_enter', userId: intruder.body.user.id, sessionId: 'sess_observable', timestamp: Date.now(), properties: { phase: 'input' } }] },
    });
    assert.equal(tracked.status, 200);

    const ownerEvents = await call(base, '/api/track/events', { token: owner.body.accessToken });
    const intruderEvents = await call(base, '/api/track/events', { token: intruder.body.accessToken });
    assert.equal(ownerEvents.body.events.some((event) => event.sessionId === 'sess_observable'), true);
    assert.equal(intruderEvents.body.events.some((event) => event.sessionId === 'sess_observable'), false);

    const metrics = await call(base, '/api/track/metrics', { token: owner.body.accessToken });
    assert.equal(metrics.body.counts.phaseEnterInput, 1);
  });
});
