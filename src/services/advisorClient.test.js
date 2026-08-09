import test from 'node:test';
import assert from 'node:assert/strict';

const advisorClient = await import('./advisorClient.js').catch(() => null);

test('advisor client exposes the real catalog contract', () => {
  assert.ok(advisorClient, 'advisorClient module must exist');
  assert.equal(typeof advisorClient.createAdvisorClient, 'function');
  assert.equal(typeof advisorClient.loadCouncilCatalog, 'function');
});

test('council catalog loads full official, owned and market pools independently', async () => {
  const client = advisorClient.createAdvisorClient(async (path) => {
    if (path.includes('source=official')) return { assets: [{ id: 'official_1', source: 'official' }, { id: 'official_2', source: 'official' }] };
    if (path.includes('source=mine')) return { assets: [{ id: 'owned_1', source: 'owned' }, { id: 'market_1', source: 'market', subscribed: true }] };
    if (path.includes('source=market')) return { assets: [{ id: 'market_1', source: 'market' }, { id: 'market_2', source: 'market' }] };
    return { assets: [] };
  });

  const catalog = await client.loadCouncilCatalog(['official_2']);

  assert.deepEqual(catalog.official.map((advisor) => advisor.id), ['official_1', 'official_2']);
  assert.deepEqual(catalog.recommended.map((advisor) => advisor.id), ['official_2']);
  assert.deepEqual(catalog.owned.map((advisor) => advisor.id), ['owned_1', 'market_1']);
  assert.deepEqual(catalog.market.map((advisor) => advisor.id), ['market_1', 'market_2']);
});

test('catalog, publish and subscription calls preserve stable advisor IDs', async () => {
  assert.ok(advisorClient, 'advisorClient module must exist');
  const calls = [];
  const request = async (path, init = {}) => {
    calls.push({ path, init });
    if (path.includes('/publish')) {
      return { asset: { id: 'published_pub-1', publishedId: 'pub-1', source: 'market' } };
    }
    if (path.includes('/subscribe')) {
      return { subscription: { id: 'sub-1' }, created: true };
    }
    return {
      assets: [{ id: 'custom-owned-1', source: 'owned', sourceId: 'owned-1', name: '边界者' }],
    };
  };
  const client = advisorClient.createAdvisorClient(request);

  const assets = await client.list('owned');
  const published = await client.publish('owned-1');
  const subscribed = await client.subscribe('pub-1');
  await client.unsubscribe('pub-1');

  assert.equal(assets[0].advisorId, 'custom-owned-1');
  assert.equal(assets[0].assetId, 'owned:owned-1');
  assert.equal(published.publishedId, 'pub-1');
  assert.equal(subscribed.id, 'sub-1');
  assert.deepEqual(calls.map((call) => [call.path, call.init.method || 'GET']), [
    ['/api/advisors/catalog?source=owned', 'GET'],
    ['/api/advisors/owned-1/publish', 'POST'],
    ['/api/advisors/market/pub-1/subscribe', 'POST'],
    ['/api/advisors/market/pub-1/subscribe', 'DELETE'],
  ]);
});
