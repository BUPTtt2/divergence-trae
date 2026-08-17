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

test('feedback is owner-only, validated, and updated instead of duplicated', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const feedbackIds = [];
  try {
    const owner = await call(base, '/api/auth/anonymous', { method: 'POST', body: {} });
    const intruder = await call(base, '/api/auth/anonymous', { method: 'POST', body: {} });
    const sessionId = `feedback-session-${Date.now()}`;
    await query({
      table: 'deliberation_sessions',
      action: 'insert',
      data: { id: sessionId, user_id: owner.body.user.id, session_id: sessionId, state: 'COMPLETE', question: 'private' },
    });

    const first = await call(base, `/api/feedback/${sessionId}`, {
      method: 'PUT',
      token: owner.body.accessToken,
      body: { helpfulness: 'neutral', tags: ['too_slow'], comment: '等待有一点久' },
    });
    assert.equal(first.status, 200);
    feedbackIds.push(first.body.feedback.id);
    await query({ table: 'product_feedback', action: 'update', id: first.body.feedback.id, data: { internal_note: '仅管理员可见' } });

    const second = await call(base, `/api/feedback/${sessionId}`, {
      method: 'PUT',
      token: owner.body.accessToken,
      body: { helpfulness: 'helpful', tags: ['destiny_card'], comment: '命牌有帮助' },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.feedback.id, first.body.feedback.id);
    assert.equal(second.body.feedback.helpfulness, 'helpful');
    assert.equal('internal_note' in second.body.feedback, false);

    const rows = await query({ table: 'product_feedback', action: 'select', filter: { user_id: owner.body.user.id, deliberation_session_id: sessionId } });
    assert.equal(rows.rows.length, 1);

    const forbidden = await call(base, `/api/feedback/${sessionId}`, {
      method: 'PUT', token: intruder.body.accessToken, body: { helpfulness: 'helpful', tags: [], comment: '' },
    });
    assert.equal(forbidden.status, 404);

    const invalid = await call(base, `/api/feedback/${sessionId}`, {
      method: 'PUT', token: owner.body.accessToken, body: { helpfulness: 'helpful', tags: ['secret_tag'], comment: 'x'.repeat(801) },
    });
    assert.equal(invalid.status, 400);

    await query({ table: 'deliberation_sessions', action: 'delete', id: sessionId });
  } finally {
    for (const id of feedbackIds) await query({ table: 'product_feedback', action: 'delete', id });
    await new Promise((resolve) => server.close(resolve));
  }
});
