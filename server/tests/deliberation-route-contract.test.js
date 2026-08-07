import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import * as memoryService from '../src/services/memoryService.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function authenticatedSession(base) {
  const authResponse = await fetch(`${base}/api/auth/anonymous`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const auth = await authResponse.json();
  const session = await memoryService.saveSession({
    user_id: auth.user.id,
    question: '契约测试',
    state: 'WAIT',
    round: 1,
  });
  return { sessionId: session.id, accessToken: auth.accessToken };
}

test('execute rejects the obsolete context-only payload before loading a session', async () => {
  await withServer(async (base) => {
    const auth = await authenticatedSession(base);
    const response = await fetch(`${base}/api/deliberation/${auth.sessionId}/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ context: { round: 1 } }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /actionId/);
  });
});

test('execute rejects non-array agentIds at the HTTP boundary', async () => {
  await withServer(async (base) => {
    const auth = await authenticatedSession(base);
    const response = await fetch(`${base}/api/deliberation/${auth.sessionId}/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${auth.accessToken}`,
      },
      body: JSON.stringify({ actionId: 'act_route_001', agentIds: 'fengyan' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /agentIds/);
  });
});
