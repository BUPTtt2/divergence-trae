import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('execute rejects the obsolete context-only payload before loading a session', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/deliberation/missing-session/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context: { round: 1 } }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /actionId/);
  });
});

test('execute rejects non-array agentIds at the HTTP boundary', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/deliberation/missing-session/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actionId: 'act_route_001', agentIds: 'fengyan' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /agentIds/);
  });
});
