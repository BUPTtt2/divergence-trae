import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/services/db.js';

async function call(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test('operations routes require a registered allowlisted principal and return content-free metrics', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const previous = process.env.ADMIN_USER_IDS;
  try {
    const anonymous = await call(base, '/api/auth/anonymous', { method: 'POST', body: {} });
    const email = `ops-${Date.now()}@example.test`;
    const admin = await call(base, '/api/auth/register', { method: 'POST', body: { email, password: 'safe-password-123', nickname: '监局者' } });

    assert.equal((await call(base, '/api/ops/overview')).status, 401);
    process.env.ADMIN_USER_IDS = admin.body.user.id;
    assert.equal((await call(base, '/api/ops/overview', { token: anonymous.body.accessToken })).status, 403);

    await query({ table: 'deliberation_sessions', action: 'insert', data: { id: 'session-ops', user_id: admin.body.user.id, session_id: 'session-ops', state: 'COMPLETE', question: 'private' } });
    await call(base, '/api/track', {
      method: 'POST',
      token: admin.body.accessToken,
      body: { events: [
        { event: 'deliberation_started', analyticsSessionId: 'visit-ops', deliberationSessionId: 'session-ops', properties: { phase: 'input', question: 'private' } },
        { event: 'phase_entered', analyticsSessionId: 'visit-ops', deliberationSessionId: 'session-ops', properties: { phase: 'final', response: 'private' } },
        { event: 'deliberation_completed', analyticsSessionId: 'visit-ops', deliberationSessionId: 'session-ops', properties: { durationMs: 9000 } },
      ] },
    });

    const overview = await call(base, '/api/ops/overview?days=7', { token: admin.body.accessToken });
    assert.equal(overview.status, 200);
    assert.equal(overview.body.metrics.starts >= 1, true);
    assert.equal(overview.body.metrics.completionRate.denominator >= 1, true);
    assert.equal(JSON.stringify(overview.body).includes('private'), false);

    const sessions = await call(base, '/api/ops/sessions?days=7', { token: admin.body.accessToken });
    assert.equal(sessions.status, 200);
    assert.equal(JSON.stringify(sessions.body).includes('question'), false);
    assert.equal(JSON.stringify(sessions.body).includes('prompt'), false);
    assert.equal(JSON.stringify(sessions.body).includes('response'), false);
    await query({ table: 'deliberation_sessions', action: 'delete', id: 'session-ops' });
  } finally {
    if (previous === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
