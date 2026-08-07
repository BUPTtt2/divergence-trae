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

async function jsonRequest(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, body: payload };
}

async function createAnonymous(base) {
  const result = await jsonRequest(base, '/api/auth/anonymous', { method: 'POST', body: {} });
  assert.equal(result.status, 201);
  return result.body;
}

test('deliberation identity comes from the signed principal, never body userId', async () => {
  await withServer(async (base) => {
    const owner = await createAnonymous(base);
    const started = await jsonRequest(base, '/api/deliberation/start', {
      method: 'POST',
      token: owner.accessToken,
      body: { question: '我应该先完成哪项计划？', userId: 'forged-victim-id' },
    });
    assert.equal(started.status, 200);
    assert.ok(started.body.sessionId);

    const stored = await memoryService.getSession(started.body.sessionId);
    assert.equal(stored.user_id, owner.user.id);
  });
});

test('non-owner cannot read or mutate another principal deliberation', async () => {
  await withServer(async (base) => {
    const owner = await createAnonymous(base);
    const intruder = await createAnonymous(base);
    const session = await memoryService.saveSession({
      user_id: owner.user.id,
      question: '是否换工作',
      state: 'WAIT',
      round: 1,
      plan: { clarifyQueue: [] },
    });
    const sid = session.id;

    const noToken = await jsonRequest(base, `/api/deliberation/${sid}`);
    assert.equal(noToken.status, 401);

    const attempts = [
      ['GET', `/${sid}`, undefined],
      ['GET', `/${sid}/clarify`, undefined],
      ['POST', `/${sid}/answer`, { answers: [] }],
      ['POST', `/${sid}/execute`, { actionId: 'action_ownership_001', agentIds: [] }],
      ['POST', `/${sid}/commit`, { choice: { id: 'a', label: 'A' } }],
      ['POST', `/${sid}/pause`, { reason: 'test' }],
      ['POST', `/${sid}/resume`, {}],
      ['POST', `/${sid}/snapshot`, { phase: 'test' }],
      ['GET', `/${sid}/resume`, undefined],
    ];

    for (const [method, path, body] of attempts) {
      const result = await jsonRequest(base, `/api/deliberation${path}`, {
        method,
        token: intruder.accessToken,
        body,
      });
      assert.equal(result.status, 404, `${method} ${path} must hide a foreign session`);
      assert.equal(result.body.error, 'SESSION_NOT_FOUND');
    }

    const ownerRead = await jsonRequest(base, `/api/deliberation/${sid}`, {
      token: owner.accessToken,
    });
    assert.equal(ownerRead.status, 200);
    assert.equal(ownerRead.body.session.sessionId, sid);
  });
});

test('event stream authenticates before sending CONNECTED', async () => {
  await withServer(async (base) => {
    const owner = await createAnonymous(base);
    const intruder = await createAnonymous(base);
    const session = await memoryService.saveSession({
      user_id: owner.user.id,
      question: '是否换工作',
      state: 'WAIT',
      round: 1,
    });
    const url = `${base}/api/deliberation/${session.id}/events`;

    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 401);
    await unauthorized.body?.cancel();

    const foreign = await fetch(url, {
      headers: { authorization: `Bearer ${intruder.accessToken}` },
    });
    assert.equal(foreign.status, 404);
    await foreign.body?.cancel();

    const controller = new AbortController();
    const owned = await fetch(url, {
      headers: { authorization: `Bearer ${owner.accessToken}` },
      signal: controller.signal,
    });
    assert.equal(owned.status, 200);
    const reader = owned.body.getReader();
    const first = await reader.read();
    controller.abort();
    const text = new TextDecoder().decode(first.value);
    assert.match(text, /"type":"CONNECTED"/);
  });
});
