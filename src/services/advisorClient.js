function normalizedAsset(asset = {}) {
  const source = asset.source || 'owned';
  const sourceId = asset.sourceId || asset.id;
  const advisorId = asset.advisorId || asset.id;
  return {
    ...asset,
    id: advisorId,
    advisorId,
    sourceId,
    assetId: asset.assetId || `${source}:${sourceId}`,
    source,
    stance: asset.stance || asset.perspective || '综合视角',
    desc: asset.description || asset.desc || asset.persona || '',
    description: asset.description || asset.desc || asset.persona || '',
    marketId: asset.publishedId || asset.marketId || null,
    subs: Number(asset.subscriptionCount ?? asset.subs) || 0,
    isCustom: source !== 'official',
    isSubscribed: Boolean(asset.subscribed),
    forged: source === 'owned',
    trigram: asset.trigram || asset.symbol || '☯',
    icon: asset.icon || asset.trigram || asset.symbol || '☯',
    avatar: asset.avatar || asset.trigram || asset.symbol || '☯',
    color: asset.color || '#C8A850',
    glow: asset.glow || '#F0D890',
  };
}

async function defaultRequest(path, init) {
  const { requestDeliberationApi } = await import('./deliberationClient.js');
  return requestDeliberationApi(path, init);
}

export function createAdvisorClient(request = defaultRequest) {
  const client = {
    async list(source = 'all', options = {}) {
      const params = new URLSearchParams({ source });
      if (options.query) params.set('query', options.query);
      if (options.limit) params.set('limit', String(options.limit));
      const result = await request(`/api/advisors/catalog?${params.toString()}`);
      return Array.isArray(result.assets) ? result.assets.map(normalizedAsset) : [];
    },

    async publish(advisorId) {
      const result = await request(`/api/advisors/${encodeURIComponent(advisorId)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return normalizedAsset(result.asset);
    },

    async subscribe(publishedId) {
      const result = await request(`/api/advisors/market/${encodeURIComponent(publishedId)}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      return result.subscription;
    },

    async unsubscribe(publishedId) {
      return request(`/api/advisors/market/${encodeURIComponent(publishedId)}/subscribe`, {
        method: 'DELETE',
      });
    },
    async loadCouncilCatalog(recommendedIds = []) {
      const [official, mine, market] = await Promise.all([
        client.list('official'),
        client.list('mine'),
        client.list('market'),
      ]);
      const byId = new Map([...official, ...mine, ...market].map((advisor) => [advisor.id, advisor]));
      return {
        recommended: (Array.isArray(recommendedIds) ? recommendedIds : []).map(String).map((id) => byId.get(id)).filter(Boolean),
        official,
        owned: mine,
        market,
      };
    },
  };
  return client;
}

const advisorClient = createAdvisorClient();

export const listAdvisorAssets = advisorClient.list;
export const publishAdvisorAsset = advisorClient.publish;
export const subscribeAdvisorAsset = advisorClient.subscribe;
export const unsubscribeAdvisorAsset = advisorClient.unsubscribe;
export const loadCouncilCatalog = advisorClient.loadCouncilCatalog;
export { normalizedAsset as normalizeAdvisorAsset };

export default advisorClient;
