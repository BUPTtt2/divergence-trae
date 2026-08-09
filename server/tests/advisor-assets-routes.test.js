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
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}

async function anonymous(base) {
  const result = await request(base, '/api/auth/anonymous', { method: 'POST', body: {} });
  assert.equal(result.status, 201);
  return result.body;
}

async function createAdvisor(base, token, suffix) {
  const result = await request(base, '/api/advisors', {
    method: 'POST',
    token,
    body: {
      name: `边界观察者-${suffix}`,
      persona: '只根据可验证事实识别边界，不替用户作决定。',
      perspective: '风险边界',
      style: '克制直接',
      element: '水',
      trigram: '☵',
    },
  });
  assert.equal(result.status, 201);
  return result.body.advisor;
}

test('catalog exposes official and owned assets without injecting sample market advisors', async () => {
  await withServer(async (base) => {
    const user = await anonymous(base);
    const advisor = await createAdvisor(base, user.accessToken, Date.now());

    const official = await request(base, '/api/advisors/catalog?source=official', {
      token: user.accessToken,
    });
    const owned = await request(base, '/api/advisors/catalog?source=owned', {
      token: user.accessToken,
    });
    const market = await request(base, '/api/advisors/catalog?source=market', {
      token: user.accessToken,
    });

    assert.equal(official.status, 200);
    assert.ok(official.body.assets.length >= 8);
    assert.ok(official.body.assets.every((asset) => asset.source === 'official'));
    assert.equal(owned.status, 200);
    assert.ok(owned.body.assets.some((asset) => asset.sourceId === advisor.id));
    assert.equal(market.status, 200);
    assert.equal(market.body.assets.some((asset) => String(asset.id).startsWith('mkt_sample_')), false);
  });
});

test('publishing requires ownership and stores an immutable versioned snapshot', async () => {
  await withServer(async (base) => {
    const owner = await anonymous(base);
    const intruder = await anonymous(base);
    const advisor = await createAdvisor(base, owner.accessToken, Date.now());

    const denied = await request(base, `/api/advisors/${advisor.id}/publish`, {
      method: 'POST',
      token: intruder.accessToken,
      body: {},
    });
    assert.equal(denied.status, 404);

    const published = await request(base, `/api/advisors/${advisor.id}/publish`, {
      method: 'POST',
      token: owner.accessToken,
      body: {},
    });
    assert.equal(published.status, 201);
    assert.equal(published.body.asset.version, 1);
    assert.equal(published.body.asset.name, advisor.name);

    const repeated = await request(base, `/api/advisors/${advisor.id}/publish`, {
      method: 'POST',
      token: owner.accessToken,
      body: {},
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.asset.publishedId, published.body.asset.publishedId);

    const changedName = `${advisor.name}-新版`;
    const updated = await request(base, `/api/advisors/${advisor.id}`, {
      method: 'PUT',
      token: owner.accessToken,
      body: { name: changedName },
    });
    assert.equal(updated.status, 200);

    const marketBeforeRepublish = await request(base, '/api/advisors/catalog?source=market', {
      token: intruder.accessToken,
    });
    const firstSnapshot = marketBeforeRepublish.body.assets.find(
      (asset) => asset.publishedId === published.body.asset.publishedId,
    );
    assert.equal(firstSnapshot.name, advisor.name);

    const nextVersion = await request(base, `/api/advisors/${advisor.id}/publish`, {
      method: 'POST',
      token: owner.accessToken,
      body: {},
    });
    assert.equal(nextVersion.status, 201);
    assert.equal(nextVersion.body.asset.version, 2);
    assert.equal(nextVersion.body.asset.name, changedName);
  });
});

test('market subscriptions are owner-scoped and idempotent', async () => {
  await withServer(async (base) => {
    const publisher = await anonymous(base);
    const subscriber = await anonymous(base);
    const stranger = await anonymous(base);
    const advisor = await createAdvisor(base, publisher.accessToken, Date.now());
    const published = await request(base, `/api/advisors/${advisor.id}/publish`, {
      method: 'POST',
      token: publisher.accessToken,
      body: {},
    });
    assert.equal(published.status, 201);
    const publishedId = published.body.asset.publishedId;

    const first = await request(base, `/api/advisors/market/${publishedId}/subscribe`, {
      method: 'POST',
      token: subscriber.accessToken,
      body: {},
    });
    const second = await request(base, `/api/advisors/market/${publishedId}/subscribe`, {
      method: 'POST',
      token: subscriber.accessToken,
      body: {},
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.subscription.id, first.body.subscription.id);

    const mine = await request(base, '/api/advisors/catalog?source=mine', {
      token: subscriber.accessToken,
    });
    const strangerMine = await request(base, '/api/advisors/catalog?source=mine', {
      token: stranger.accessToken,
    });
    assert.ok(mine.body.assets.some((asset) => asset.publishedId === publishedId && asset.subscribed));
    assert.equal(strangerMine.body.assets.some((asset) => asset.publishedId === publishedId), false);

    const removed = await request(base, `/api/advisors/market/${publishedId}/subscribe`, {
      method: 'DELETE',
      token: subscriber.accessToken,
    });
    const removedAgain = await request(base, `/api/advisors/market/${publishedId}/subscribe`, {
      method: 'DELETE',
      token: subscriber.accessToken,
    });
    assert.equal(removed.status, 200);
    assert.equal(removedAgain.status, 200);
    assert.equal(removedAgain.body.removed, false);
  });
});
