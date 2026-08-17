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

test('artwork jobs are owner-scoped, style-controlled and idempotent when provider is unavailable', async () => {
  await withServer(async (base) => {
    const owner = await anonymous(base);
    const intruder = await anonymous(base);
    const created = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: { title: '先验证', question: '要不要换工作？', decision: '先做访谈', gua: '风山渐' },
    });
    const cardId = created.body.card.id;

    const first = await request(base, `/api/cards/${cardId}/artwork-jobs`, {
      method: 'POST',
      token: owner.accessToken,
      body: { styleId: 'ink_landscape', idempotencyKey: `artwork-${Date.now()}` },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.job.status, 'failed');
    assert.equal(first.body.job.creditConsumed, false);

    const replay = await request(base, `/api/cards/${cardId}/artwork-jobs`, {
      method: 'POST',
      token: owner.accessToken,
      body: { styleId: 'ink_landscape', idempotencyKey: first.body.idempotencyKey },
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.job.id, first.body.job.id);

    const hidden = await request(base, `/api/cards/${cardId}/artwork-jobs`, {
      method: 'POST',
      token: intruder.accessToken,
      body: { styleId: 'ink_landscape', idempotencyKey: 'intruder-request' },
    });
    assert.equal(hidden.status, 404);

    const invalid = await request(base, `/api/cards/${cardId}/artwork-jobs`, {
      method: 'POST',
      token: owner.accessToken,
      body: { styleId: 'free_form_prompt', idempotencyKey: 'invalid-style' },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.errorCode, 'ARTWORK_STYLE_INVALID');
  });
});
