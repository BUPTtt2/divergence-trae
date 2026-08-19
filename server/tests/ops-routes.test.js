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
  let publicFeedbackId;
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
    await query({ table: 'llm_usage_events', action: 'insert', data: {
      id: 'usage-ops', provider: 'ark-primary', model: 'ep-public', stage: 'planner', status: 'success', attempt: 1,
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, usage_missing: false,
      latency_ms: 80, estimated_cost_cny: 0.003, created_at: new Date().toISOString(),
    } });
    const costs = await call(base, '/api/ops/costs?days=7', { token: admin.body.accessToken });
    assert.equal(costs.status, 200);
    assert.equal(costs.body.summary.tokens.total >= 120, true);
    assert.equal(JSON.stringify(costs.body).includes('prompt'), false);
    assert.equal(JSON.stringify(costs.body).includes('content'), false);

    publicFeedbackId = `ops-feedback-${Date.now()}`;
    await query({ table: 'feedback_inbox', action: 'insert', data: {
      id: publicFeedbackId, category: 'bug', message: '首页反馈入口看不见', email: null, page: '/',
      idempotency_key: `${publicFeedbackId}-idempotency`, content_fingerprint: publicFeedbackId,
      subject_hash: 'test-subject', review_status: 'unread', internal_note: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    } });
    const publicFeedback = await call(base, '/api/ops/public-feedback?days=7', { token: admin.body.accessToken });
    assert.equal(publicFeedback.status, 200);
    assert.equal(publicFeedback.body.feedback.some((item) => item.id === publicFeedbackId), true);
    const reviewed = await call(base, `/api/ops/public-feedback/${publicFeedbackId}`, {
      method: 'PATCH', token: admin.body.accessToken, body: { reviewStatus: 'resolved', internalNote: '已处理' },
    });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.feedback.review_status, 'resolved');
    await query({ table: 'deliberation_sessions', action: 'delete', id: 'session-ops' });
    await query({ table: 'llm_usage_events', action: 'delete', id: 'usage-ops' });
  } finally {
    if (publicFeedbackId) await query({ table: 'feedback_inbox', action: 'delete', id: publicFeedbackId });
    if (previous === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
