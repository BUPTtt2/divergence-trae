import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function anonymous(base) {
  const response = await request(base, '/api/auth/anonymous', { method: 'POST', body: {} });
  assert.equal(response.status, 201);
  return response.body;
}

const completeReplay = {
  schemaVersion: 2,
  completeness: 'complete',
  events: [
    { id: 'evt-1', seq: 1, kind: 'user_question', phase: 'input', speakerType: 'user', speakerId: 'user', speakerName: '我', text: '要不要换工作？' },
    { id: 'evt-2', seq: 2, kind: 'clarification_question', phase: 'clarify_loop', speakerType: 'system', speakerId: 'yan', speakerName: '演', text: '你的底线是什么？' },
    { id: 'evt-3', seq: 3, kind: 'clarification_answer', phase: 'clarify_loop', speakerType: 'user', speakerId: 'user', speakerName: '我', text: '不能降薪' },
  ],
};

test('owned cards persist and return a complete Replay V2 timeline', async () => {
  await withServer(async (base) => {
    const owner = await anonymous(base);
    const intruder = await anonymous(base);
    const created = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        sessionId: `sess-replay-${Date.now()}`,
        title: '先验证',
        question: '要不要换工作？',
        replay: completeReplay,
      },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.card.replay_schema_version, 2);
    assert.equal(created.body.card.replay_completeness, 'complete');
    assert.deepEqual(created.body.card.replay.events.map((event) => event.text), [
      '要不要换工作？', '你的底线是什么？', '不能降薪',
    ]);

    const fetched = await request(base, `/api/cards/${created.body.card.id}`, { token: owner.accessToken });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.card.replay.events[2].text, '不能降薪');

    const appendedReplay = {
      ...completeReplay,
      events: [
        ...completeReplay.events,
        { id: 'evt-4', seq: 4, kind: 'commitment', phase: 'committing', speakerType: 'user', speakerId: 'user', speakerName: '我', text: '本周五完成约谈' },
      ],
    };
    const appended = await request(base, `/api/cards/${created.body.card.id}`, {
      method: 'PUT',
      token: owner.accessToken,
      body: { replay: appendedReplay },
    });
    assert.equal(appended.status, 200);
    assert.equal(appended.body.card.replay.events[3].kind, 'commitment');

    const rewritten = await request(base, `/api/cards/${created.body.card.id}`, {
      method: 'PUT',
      token: owner.accessToken,
      body: { replay: { ...completeReplay, events: [{ ...completeReplay.events[0], text: '被改写的问题' }] } },
    });
    assert.equal(rewritten.status, 409);
    assert.equal(rewritten.body.errorCode, 'REPLAY_NOT_APPEND_ONLY');

    const hidden = await request(base, `/api/cards/${created.body.card.id}`, { token: intruder.accessToken });
    assert.equal(hidden.status, 404);
  });
});

test('card replay rejects unsupported event kinds and oversized text', async () => {
  await withServer(async (base) => {
    const owner = await anonymous(base);
    const unsupported = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        title: '非法事件',
        replay: { schemaVersion: 2, completeness: 'complete', events: [{ id: 'evt-x', seq: 1, kind: 'raw_prompt', text: '秘密提示词' }] },
      },
    });
    const oversized = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        title: '超长正文',
        replay: { schemaVersion: 2, completeness: 'complete', events: [{ id: 'evt-y', seq: 1, kind: 'user_question', text: '问'.repeat(4001) }] },
      },
    });

    assert.equal(unsupported.status, 400);
    assert.equal(unsupported.body.errorCode, 'INVALID_REPLAY');
    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.errorCode, 'INVALID_REPLAY');
  });
});
