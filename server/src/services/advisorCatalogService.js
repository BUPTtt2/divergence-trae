import crypto from 'crypto';

import { AGENT_POOL } from '../data/agentPool.js';
import { query } from './db.js';
import { getAdvisor, listAdvisors } from './customAdvisorService.js';
import { generateUUID } from '../utils/id.js';

const PUBLISHED_TABLE = 'published_advisors';
const SUBSCRIPTION_TABLE = 'advisor_subscriptions';

const STARTER_MARKET_ADVISORS = [
  { id: 'starter_city', name: '城居参谋', perspective: '居住与通勤', trigram: '巽', objective: '把预算、通勤、租期和共同居住者的约束转成可查证的选址条件', methodology: ['先校准预算口径', '再形成通勤锚点', '最后比较过渡与长期方案'], toolPolicy: { allow: ['web_search'], deny: ['business_write'] } },
  { id: 'starter_career', name: '职途教练', perspective: '职业路径', trigram: '震', objective: '区分短期机会、能力积累和长期职业选择', methodology: ['识别当前阶段', '比较机会成本', '设计可逆试验'] },
  { id: 'starter_cashflow', name: '钱包守门人', perspective: '现金流', trigram: '兑', objective: '检查预算口径、现金缓冲和最坏情况下的承受能力', methodology: ['核对收入稳定性', '计算固定支出比例', '设置止损线'] },
  { id: 'starter_relation', name: '关系调解者', perspective: '共同决策', trigram: '离', objective: '识别共同决策中的诉求差异、责任分配和沟通风险', methodology: ['分别陈述诉求', '标记不可妥协项', '形成共同确认点'] },
  { id: 'starter_learning', name: '学习规划师', perspective: '学习成长', trigram: '艮', objective: '把学习目标拆成路径、节奏、反馈和退出条件', methodology: ['定义可验证目标', '估算时间成本', '设置复盘节点'] },
  { id: 'starter_product', name: '产品验证官', perspective: '用户价值', trigram: '乾', objective: '用真实用户路径、证据和最小试验检验产品判断', methodology: ['界定目标用户', '定位关键场景', '设计最小验证'] },
  { id: 'starter_risk', name: '风险审计员', perspective: '风险与反证', trigram: '坎', objective: '主动寻找假设、失败模式和会推翻当前结论的证据', methodology: ['列出关键假设', '构造反例', '定义反转条件'] },
  { id: 'starter_action', name: '行动设计师', perspective: '执行落地', trigram: '坤', objective: '把结论转成有负责人、时间点和反馈信号的下一步', methodology: ['确定第一步', '压缩行动成本', '设置反馈回路'] },
];

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
    avatar: clean(advisor.avatar) || null,
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
    avatar: advisor.avatar,
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
    avatar: publication.avatar,
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

function starterMarketAsset(advisor) {
  return {
    id: advisor.id,
    assetId: `starter:${advisor.id}`,
    advisorId: advisor.id,
    sourceId: advisor.id,
    source: 'market',
    version: 1,
    name: advisor.name,
    stance: advisor.perspective,
    perspective: advisor.perspective,
    description: advisor.objective,
    persona: `你是${advisor.name}，专注${advisor.perspective}，所有判断都要标明依据、假设与反转条件。`,
    style: '市集精选',
    trigram: advisor.trigram,
    subscribed: false,
    curated: true,
    owned: false,
    publishable: false,
    subscriptionCount: 0,
    evalStatus: 'curated',
    contract: {
      objective: advisor.objective,
      methodology: advisor.methodology,
      deliverable: '给出完整判断、证据状态、关键假设、反转条件和下一步',
      toolPolicy: advisor.toolPolicy || { allow: [], deny: ['business_write'] },
      evidencePolicy: { minimumLevel: 'E0', discloseUnknowns: true },
      completionCriteria: ['回应本轮任务', '列出至少一个反转条件'],
      safetyBoundaries: ['不编造用户事实', '没有可用来源时明确标为未知', '不替用户作最终决定'],
      budget: { maxTurns: 2, maxToolCalls: advisor.toolPolicy?.allow?.length ? 2 : 0, timeoutMs: 35000 },
    },
  };
}

function executableStarterAsset(asset) {
  return executableMarketAsset(starterMarketAsset(asset), true);
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
    assets = [
      ...STARTER_MARKET_ADVISORS.map(starterMarketAsset),
      ...latestPublished.map((item) => marketAsset(item, subscribedIds.has(item.id), userId)),
    ];
  } else if (source === 'mine') {
    const owned = (await listAdvisors(userId)).map((advisor) => ownedAsset(advisor, ownLatest));
    const subscribed = latestPublished
      .filter((item) => subscribedIds.has(item.id))
      .map((item) => marketAsset(item, true, userId));
    assets = [...owned, ...subscribed];
  } else {
    const owned = (await listAdvisors(userId)).map((advisor) => ownedAsset(advisor, ownLatest));
    const market = [
      ...STARTER_MARKET_ADVISORS.map(starterMarketAsset),
      ...latestPublished.map((item) => marketAsset(item, subscribedIds.has(item.id), userId)),
    ];
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
  const starterIds = new Set(advisorIds.map((id) => String(id || '')).filter((id) => id.startsWith('starter_')));
  const wanted = new Set(
    advisorIds
      .map((id) => String(id || ''))
      .filter((id) => id.startsWith('published_'))
      .map((id) => id.slice('published_'.length)),
  );
  const starterAssets = STARTER_MARKET_ADVISORS
    .filter((advisor) => starterIds.has(advisor.id))
    .map(executableStarterAsset);
  if (wanted.size === 0) return starterAssets;
  const rows = await publications();
  return [
    ...starterAssets,
    ...rows
    .filter((row) => wanted.has(row.id))
    .map((row) => executableMarketAsset(marketAsset(row, false), false)),
  ];
}

export default {
  listCatalog,
  publishOwnedAdvisor,
  subscribeAdvisor,
  unsubscribeAdvisor,
  listExecutableMarketAdvisors,
  listExecutablePublicAdvisors,
};
