import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test('cards and follow-ups use the signed principal and hide another user records', async () => {
  await withServer(async (base) => {
    const owner = await anonymous(base);
    const intruder = await anonymous(base);
    const card = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        userId: intruder.user.id,
        title: '两周试行',
        question: '是否先试行两周？',
        decision: '先试行并记录指标',
        summary: '若连续三天超出预算则停止。',
      },
    });
    assert.equal(card.status, 201);
    assert.equal(card.body.card.user_id, owner.user.id);

    const firstSessionCard = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        sessionId: 'sess-ledger-idempotent',
        title: '已确认路径',
        question: '是否执行路径 A？',
        decision: '执行路径 A',
        reversalConditions: ['预算超过上限'],
        nextActions: ['明天完成第一步'],
      },
    });
    const replayedSessionCard = await request(base, '/api/cards', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        sessionId: 'sess-ledger-idempotent',
        title: '重复点击不应新增',
        question: '是否执行路径 A？',
        decision: '执行路径 A',
      },
    });
    assert.equal(firstSessionCard.status, 201);
    assert.equal(replayedSessionCard.status, 200);
    assert.equal(replayedSessionCard.body.card.id, firstSessionCard.body.card.id);
    assert.equal(replayedSessionCard.body.idempotentReplay, true);

    const followUp = await request(base, '/api/follow-up', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        userId: intruder.user.id,
        cardId: card.body.card.id,
        question: card.body.card.question,
        decision: card.body.card.decision,
        daysLater: 7,
      },
    });
    assert.equal(followUp.status, 201);
    assert.equal(followUp.body.followUp.user_id, owner.user.id);

    const duplicateFollowUp = await request(base, '/api/follow-up', {
      method: 'POST',
      token: owner.accessToken,
      body: {
        cardId: card.body.card.id,
        question: card.body.card.question,
        decision: card.body.card.decision,
        daysLater: 30,
      },
    });
    assert.equal(duplicateFollowUp.status, 200);
    assert.equal(duplicateFollowUp.body.followUp.id, followUp.body.followUp.id);
    assert.equal(duplicateFollowUp.body.idempotentReplay, true);

    const ownerCards = await request(base, `/api/cards?userId=${intruder.user.id}`, {
      token: owner.accessToken,
    });
    const intruderCards = await request(base, `/api/cards?userId=${owner.user.id}`, {
      token: intruder.accessToken,
    });
    assert.equal(ownerCards.body.cards.some((item) => item.id === card.body.card.id), true);
    assert.equal(intruderCards.body.cards.some((item) => item.id === card.body.card.id), false);

    const intruderFollowUps = await request(base, `/api/follow-up?userId=${owner.user.id}`, {
      token: intruder.accessToken,
    });
    assert.equal(intruderFollowUps.body.items.some((item) => item.id === followUp.body.followUp.id), false);

    const deniedComplete = await request(base, `/api/follow-up/${followUp.body.followUp.id}`, {
      method: 'PUT',
      token: intruder.accessToken,
      body: { result: '伪造结果' },
    });
    assert.equal(deniedComplete.status, 404);

    const completed = await request(base, `/api/follow-up/${followUp.body.followUp.id}`, {
      method: 'PUT',
      token: owner.accessToken,
      body: { result: '试行后达到了预期指标', status: 'positive' },
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.followUp.status, 'completed');
    assert.equal(completed.body.followUp.outcome_status, 'positive');

    const invalidOutcome = await request(base, `/api/follow-up/${followUp.body.followUp.id}`, {
      method: 'PUT',
      token: owner.accessToken,
      body: { result: '不可接受的分类', status: 'accurate' },
    });
    assert.equal(invalidOutcome.status, 400);
  });
});
