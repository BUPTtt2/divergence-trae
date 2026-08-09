import crypto from 'crypto';

import { AGENT_POOL } from '../data/agentPool.js';
import { query } from './db.js';
import { getAdvisor, listAdvisors } from './customAdvisorService.js';
import { generateUUID } from '../utils/id.js';

const PUBLISHED_TABLE = 'published_advisors';
const SUBSCRIPTION_TABLE = 'advisor_subscriptions';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function structured(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function contractSummary(advisor = {}) {
  const parsedMethodology = structured(advisor.methodology, null);
  const methodology = Array.isArray(parsedMethodology)
    ? parsedMethodology
    : (clean(advisor.methodology) ? [clean(advisor.methodology)] : []);
  return {
    objective: clean(advisor.objective) || clean(advisor.stance) || clean(advisor.perspective),
    methodology,
    deliverable: clean(advisor.deliverable) || '给出判断依据、反转条件和下一步建议',
    toolPolicy: structured(advisor.tool_policy ?? advisor.toolPolicy, { allow: [], deny: ['business_write'] }),
    evidencePolicy: structured(advisor.evidence_policy ?? advisor.evidencePolicy, { minimumLevel: 'E0' }),
    completionCriteria: structured(advisor.completion_criteria ?? advisor.completionCriteria, ['给出至少一个反转条件']),
    safetyBoundaries: structured(advisor.safety_boundaries ?? advisor.safetyBoundaries, ['不编造用户事实', '不替用户作最终决定']),
    budget: structured(advisor.budget, { maxTurns: 2, maxToolCalls: 0, timeoutMs: 35000 }),
    evalSummary: structured(advisor.eval_summary ?? advisor.evalSummary, null),
  };
}

function snapshotPayload(advisor) {
  const contract = contractSummary(advisor);
  return {
    name: clean(advisor.name),
    persona: clean(advisor.persona),
    perspective: clean(advisor.perspective),
    style: clean(advisor.style) || '周易古风',
    element: clean(advisor.element) || null,
    trigram: clean(advisor.trigram) || null,
    contract_snapshot: contract,
  };
}

function snapshotHash(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function officialAsset(agent) {
  return {
    id: agent.id,
    assetId: `official:${agent.id}`,
    advisorId: agent.id,
    sourceId: agent.id,
    source: 'official',
    version: 1,
    name: agent.name,
    stance: agent.stance,
    perspective: agent.perspective,
    description: agent.desc || agent.stance,
    persona: agent.persona,
    style: '演策官方',
    element: null,
    trigram: agent.symbol || null,
    color: agent.color,
    glow: agent.glow,
    subscribed: false,
    owned: false,
    publishable: false,
    subscriptionCount: 0,
    contract: contractSummary(agent),
  };
}

function ownedAsset(advisor, publishedBySource = new Map()) {
  const publication = publishedBySource.get(advisor.id);
  return {
    id: `custom_${advisor.id}`,
    assetId: `owned:${advisor.id}`,
    advisorId: `custom_${advisor.id}`,
    sourceId: advisor.id,
    source: 'owned',
    version: 1,
    name: advisor.name,
    stance: advisor.perspective,
    perspective: advisor.perspective,
    description: advisor.persona,
    persona: advisor.persona,
    style: advisor.style,
    element: advisor.element,
    trigram: advisor.trigram,
    subscribed: false,
    owned: true,
    publishable: true,
    publishedId: publication?.id || null,
    publishedVersion: publication?.version || null,
    publishedAt: publication?.created_at || null,
    contract: contractSummary(advisor),
  };
}

function marketAsset(publication, subscribed = false, userId = null) {
  return {
    id: `published_${publication.id}`,
    assetId: `market:${publication.id}`,
    advisorId: `published_${publication.id}`,
    sourceId: publication.source_advisor_id,
    source: 'market',
    publishedId: publication.id,
    version: Number(publication.version) || 1,
    name: publication.name,
    stance: publication.perspective,
    perspective: publication.perspective,
    description: publication.persona,
    persona: publication.persona,
    style: publication.style,
    element: publication.element,
    trigram: publication.trigram,
    subscribed,
    publishedByMe: Boolean(userId && publication.owner_user_id === userId),
    owned: false,
    publishable: false,
    subscriptionCount: Number(publication.subscription_count) || 0,
    publishedAt: publication.created_at,
    contract: structured(publication.contract_snapshot, contractSummary(publication)),
    evalStatus: publication.eval_status || 'unverified',
  };
}

function executableMarketAsset(asset, subscribed) {
  const contract = asset.contract || contractSummary(asset);
  return {
    id: asset.advisorId,
    name: asset.name,
    stance: asset.stance,
    perspective: asset.perspective,
    persona: asset.persona,
    identity: `你是${asset.name}。你的任务目标是：${contract.objective}。${asset.persona}`,
    methodology: Array.isArray(contract.methodology) ? contract.methodology.join('\n') : String(contract.methodology || ''),
    deliverable: `${contract.deliverable}。完成条件：${(contract.completionCriteria || []).join('；')}。安全边界：${(contract.safetyBoundaries || []).join('；')}。`,
    toolPolicy: contract.toolPolicy,
    evidencePolicy: contract.evidencePolicy,
    completionCriteria: contract.completionCriteria,
    safetyBoundaries: contract.safetyBoundaries,
    budget: contract.budget,
    style: asset.style,
    element: asset.element,
    trigram: asset.trigram,
    desc: asset.description,
    isCustom: true,
    isSubscribed: subscribed,
    source: 'market',
    publishedId: asset.publishedId,
    questionTypes: ['life', 'career', 'finance', 'relationship', 'action', 'communication'],
  };
}

async function publications() {
  const result = await query({
    table: PUBLISHED_TABLE,
    action: 'select',
    filter: { status: 'active', visibility: 'public' },
    queryOptions: { orderBy: 'created_at:desc', limit: 200 },
  });
  return result.rows || [];
}

async function subscriptionsFor(userId) {
  if (!userId) return [];
  const result = await query({
    table: SUBSCRIPTION_TABLE,
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { orderBy: 'created_at:desc', limit: 200 },
  });
  return result.rows || [];
}

function latestPublicationBySource(rows, ownerUserId = null) {
  const latest = new Map();
  for (const row of rows) {
    if (ownerUserId && row.owner_user_id !== ownerUserId) continue;
    const current = latest.get(row.source_advisor_id);
    if (!current || Number(row.version) > Number(current.version)) {
      latest.set(row.source_advisor_id, row);
    }
  }
  return latest;
}

function searchable(asset, queryText) {
  if (!queryText) return true;
  const haystack = `${asset.name} ${asset.stance} ${asset.description}`.toLowerCase();
  return haystack.includes(queryText.toLowerCase());
}

export async function listCatalog({ userId, source = 'all', query: queryText = '', limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 200));
  const published = await publications();
  const subscriptions = await subscriptionsFor(userId);
  const subscribedIds = new Set(subscriptions.map((item) => item.published_advisor_id));
  const latestPublished = [...latestPublicationBySource(published).values()];
  const ownLatest = latestPublicationBySource(published, userId);

  let assets;
  if (source === 'official') {
    assets = AGENT_POOL.map(officialAsset);
  } else if (source === 'owned') {
    assets = (await listAdvisors(userId)).map((advisor) => ownedAsset(advisor, ownLatest));
  } else if (source === 'market') {
    assets = latestPublished.map((item) => marketAsset(item, subscribedIds.has(item.id), userId));
  } else if (source === 'mine') {
    const owned = (await listAdvisors(userId)).map((advisor) => ownedAsset(advisor, ownLatest));
    const subscribed = latestPublished
      .filter((item) => subscribedIds.has(item.id))
      .map((item) => marketAsset(item, true, userId));
    assets = [...owned, ...subscribed];
  } else {
    const owned = (await listAdvisors(userId)).map((advisor) => ownedAsset(advisor, ownLatest));
    const market = latestPublished.map((item) => marketAsset(item, subscribedIds.has(item.id), userId));
    assets = [...AGENT_POOL.map(officialAsset), ...owned, ...market];
  }

  return assets.filter((asset) => searchable(asset, queryText)).slice(0, safeLimit);
}

export async function publishOwnedAdvisor({ userId, advisorId }) {
  const advisor = await getAdvisor(advisorId, userId);
  if (!advisor) return null;

  const snapshot = snapshotPayload(advisor);
  const hash = snapshotHash(snapshot);
  const existing = await query({
    table: PUBLISHED_TABLE,
    action: 'select',
    filter: {
      owner_user_id: userId,
      source_advisor_id: advisorId,
      snapshot_hash: hash,
    },
    queryOptions: { limit: 1 },
  });
  if (existing.rows[0]) {
    return { asset: marketAsset(existing.rows[0], false, userId), created: false };
  }

  const prior = await query({
    table: PUBLISHED_TABLE,
    action: 'select',
    filter: { owner_user_id: userId, source_advisor_id: advisorId },
    queryOptions: { orderBy: 'version:desc', limit: 1 },
  });
  const version = (Number(prior.rows[0]?.version) || 0) + 1;
  const result = await query({
    table: PUBLISHED_TABLE,
    action: 'insert',
    data: {
      id: generateUUID(),
      source_advisor_id: advisorId,
      owner_user_id: userId,
      version,
      snapshot_hash: hash,
      ...snapshot,
      visibility: 'public',
      status: 'active',
      subscription_count: 0,
    },
  });
  return { asset: marketAsset(result.rows[0], false, userId), created: true };
}

export async function subscribeAdvisor({ userId, publishedAdvisorId }) {
  const published = await query({
    table: PUBLISHED_TABLE,
    action: 'select',
    filter: { id: publishedAdvisorId, status: 'active', visibility: 'public' },
    queryOptions: { limit: 1 },
  });
  if (!published.rows[0]) return null;

  const existing = await query({
    table: SUBSCRIPTION_TABLE,
    action: 'select',
    filter: { user_id: userId, published_advisor_id: publishedAdvisorId },
    queryOptions: { limit: 1 },
  });
  if (existing.rows[0]) return { subscription: existing.rows[0], created: false };

  const inserted = await query({
    table: SUBSCRIPTION_TABLE,
    action: 'insert',
    data: {
      id: generateUUID(),
      user_id: userId,
      published_advisor_id: publishedAdvisorId,
    },
  });
  const count = (Number(published.rows[0].subscription_count) || 0) + 1;
  await query({
    table: PUBLISHED_TABLE,
    action: 'update',
    id: publishedAdvisorId,
    data: { subscription_count: count },
  });
  return { subscription: inserted.rows[0], created: true };
}

export async function unsubscribeAdvisor({ userId, publishedAdvisorId }) {
  const existing = await query({
    table: SUBSCRIPTION_TABLE,
    action: 'select',
    filter: { user_id: userId, published_advisor_id: publishedAdvisorId },
    queryOptions: { limit: 1 },
  });
  if (!existing.rows[0]) return { removed: false };

  await query({ table: SUBSCRIPTION_TABLE, action: 'delete', id: existing.rows[0].id });
  const published = await query({
    table: PUBLISHED_TABLE,
    action: 'select',
    filter: { id: publishedAdvisorId },
    queryOptions: { limit: 1 },
  });
  if (published.rows[0]) {
    await query({
      table: PUBLISHED_TABLE,
      action: 'update',
      id: publishedAdvisorId,
      data: {
        subscription_count: Math.max(0, (Number(published.rows[0].subscription_count) || 0) - 1),
      },
    });
  }
  return { removed: true };
}

export async function listExecutableMarketAdvisors(userId) {
  const assets = await listCatalog({ userId, source: 'mine', limit: 200 });
  return assets
    .filter((asset) => asset.source === 'market' && asset.subscribed)
    .map((asset) => executableMarketAsset(asset, true));
}

export async function listExecutablePublicAdvisors(advisorIds = []) {
  const wanted = new Set(
    advisorIds
      .map((id) => String(id || ''))
      .filter((id) => id.startsWith('published_'))
      .map((id) => id.slice('published_'.length)),
  );
  if (wanted.size === 0) return [];
  const rows = await publications();
  return rows
    .filter((row) => wanted.has(row.id))
    .map((row) => executableMarketAsset(marketAsset(row, false), false));
}

export default {
  listCatalog,
  publishOwnedAdvisor,
  subscribeAdvisor,
  unsubscribeAdvisor,
  listExecutableMarketAdvisors,
  listExecutablePublicAdvisors,
};
