import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import * as memoryService from '../src/services/memoryService.js';
import { query } from '../src/services/db.js';

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

test('memories and custom advisors are scoped to the signed principal', async () => {
  await withServer(async (base) => {
    const owner = await createAnonymous(base);
    const intruder = await createAnonymous(base);
    await query({
      table: 'user_memory',
      action: 'insert',
      data: {
        id: `memory_${Date.now()}`,
        user_id: owner.user.id,
        content: '仅属于 owner 的记忆',
        memory_type: 'preference',
        importance: 5,
      },
    });

    const ownerMemories = await jsonRequest(base, '/api/deliberation/memories?userId=forged', {
      token: owner.accessToken,
    });
    const intruderMemories = await jsonRequest(base, `/api/deliberation/memories?userId=${owner.user.id}`, {
      token: intruder.accessToken,
    });
    assert.equal(ownerMemories.body.memories.some((item) => item.content === '仅属于 owner 的记忆'), true);
    assert.equal(intruderMemories.body.memories.some((item) => item.content === '仅属于 owner 的记忆'), false);

    const created = await jsonRequest(base, '/api/deliberation/advisors', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        name: '隔离测试智囊',
        persona: '只为 owner 服务',
        perspective: 'risk',
        userId: intruder.user.id,
      },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.user_id, owner.user.id);

    const intruderList = await jsonRequest(base, `/api/deliberation/advisors?userId=${owner.user.id}`, {
      token: intruder.accessToken,
    });
    assert.equal(intruderList.body.advisors.some((item) => item.id === created.body.id), false);

    const update = await jsonRequest(base, `/api/deliberation/advisors/${created.body.id}`, {
      method: 'PUT',
      token: intruder.accessToken,
      body: { name: '越权修改', userId: owner.user.id },
    });
    const remove = await jsonRequest(base, `/api/deliberation/advisors/${created.body.id}`, {
      method: 'DELETE',
      token: intruder.accessToken,
      body: { userId: owner.user.id },
    });
    assert.equal(update.status, 404);
    assert.equal(remove.status, 404);
  });
});
