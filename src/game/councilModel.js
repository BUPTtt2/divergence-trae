const COUNCIL_STATES = new Set(['recommended', 'selected', 'queued', 'running', 'completed', 'failed']);

function uniqueAdvisors(advisors) {
  const seen = new Set();
  return (Array.isArray(advisors) ? advisors : []).filter((advisor) => {
    const id = String(advisor?.id || advisor?.advisorId || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((advisor) => ({ ...advisor, id: String(advisor.id || advisor.advisorId).trim() }));
}

function advisorPerspective(advisor) {
  return String(advisor?.perspective || advisor?.stance || advisor?.perspectiveLabel || '综合').replace(/视角$/, '').trim();
}

function firstText(value, fallback) {
  if (Array.isArray(value)) return String(value.find(Boolean) || fallback);
  return String(value || fallback);
}

export function advisorCardContract(advisor = {}) {
  const toolPolicy = advisor.toolPolicy || advisor.tool_policy || {};
  const allowedTools = Array.isArray(toolPolicy.allow) ? toolPolicy.allow.filter(Boolean) : [];
  return {
    recommendationReason: firstText(advisor.reason, '提供一个与当前案卷互补的独立视角。'),
    capability: firstText(advisor.objective || advisor.deliverable || advisor.description || advisor.desc, '围绕案卷事实给出可追溯判断。'),
    blindSpot: firstText(advisor.safetyBoundaries || advisor.safety_boundaries, `主要覆盖${advisorPerspective(advisor)}，其他视角需要由不同智囊补足。`),
    tools: allowedTools.length > 0 ? `可用 ${allowedTools.join('、')}` : '不调用外部工具',
  };
}

export function createCouncilModel({
  official = [],
  owned = [],
  market = [],
  recommendedIds = [],
  recommendationDetails = [],
  selectedIds = [],
  selectionSource = 'none',
} = {}) {
  const detailById = new Map((Array.isArray(recommendationDetails) ? recommendationDetails : [])
    .filter((item) => item?.agentId)
    .map((item) => [String(item.agentId), item]));
  const enrich = (advisors) => uniqueAdvisors(advisors).map((advisor) => {
    const detail = detailById.get(advisor.id);
    return detail ? {
      ...advisor,
      reason: detail.reason || advisor.reason,
      recommendationScore: detail.score || advisor.recommendationScore,
      matchedDimensions: detail.matchedDimensions || advisor.matchedDimensions || [],
      recommendationSource: detail.source || advisor.recommendationSource,
    } : advisor;
  });
  const officialPool = enrich(official);
  const ownedPool = enrich(owned);
  const marketPool = enrich(market);
  const catalog = uniqueAdvisors([...officialPool, ...ownedPool, ...marketPool]);
  const catalogById = new Map(catalog.map((advisor) => [advisor.id, advisor]));
  const recommendationOrder = uniqueAdvisors((Array.isArray(recommendedIds) ? recommendedIds : [])
    .map((id) => catalogById.get(String(id)))
    .filter(Boolean));
  const validSelectedIds = [...new Set((Array.isArray(selectedIds) ? selectedIds : [])
    .map(String)
    .filter((id) => catalogById.has(id)))];
  return {
    official: officialPool,
    owned: ownedPool,
    market: marketPool,
    recommended: recommendationOrder,
    selectedIds: validSelectedIds,
    selectionSource,
    catalog,
    catalogById,
  };
}

function rebuild(model, selectedIds, selectionSource) {
  return createCouncilModel({
    official: model?.official,
    owned: model?.owned,
    market: model?.market,
    recommendedIds: (model?.recommended || []).map((advisor) => advisor.id),
    recommendationDetails: (model?.recommended || []).map((advisor) => ({
      agentId: advisor.id,
      reason: advisor.reason,
      score: advisor.recommendationScore,
      matchedDimensions: advisor.matchedDimensions,
      source: advisor.recommendationSource,
    })),
    selectedIds,
    selectionSource,
  });
}

export function acceptRecommendation(model) {
  return rebuild(model, (model?.recommended || []).map((advisor) => advisor.id), 'recommendation-accepted');
}

export function toggleAdvisor(model, advisorId) {
  const id = String(advisorId || '').trim();
  if (!id || !model?.catalogById?.has(id)) return model;
  const selected = new Set(model.selectedIds || []);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return rebuild(model, [...selected], 'manual');
}

export function replaceSeat(model, { previousAdvisorId, advisorId } = {}) {
  const nextId = String(advisorId || '').trim();
  if (!nextId || !model?.catalogById?.has(nextId)) return model;
  const selected = (model.selectedIds || []).filter((id) => id !== String(previousAdvisorId || ''));
  if (!selected.includes(nextId)) selected.push(nextId);
  return rebuild(model, selected, 'manual');
}

export function coverageDelta(model, candidateId) {
  const selectedPerspectives = new Set((model?.selectedIds || [])
    .map((id) => model.catalogById?.get(id))
    .filter(Boolean)
    .map(advisorPerspective));
  const candidate = model?.catalogById?.get(String(candidateId || ''));
  if (!candidate) return { adds: [], duplicates: [] };
  const perspective = advisorPerspective(candidate);
  return selectedPerspectives.has(perspective)
    ? { adds: [], duplicates: [perspective] }
    : { adds: [perspective], duplicates: [] };
}

export function buildCouncilSeats({ recommendation = [], selection = [], catalog } = {}) {
  const selectedIds = (Array.isArray(selection) ? selection : []).map((item) => String(item?.id || item || '')).filter(Boolean);
  const source = selectedIds.length > 0
    ? selectedIds.map((id) => catalog?.catalogById?.get(id)).filter(Boolean)
    : uniqueAdvisors(recommendation);
  const state = selectedIds.length > 0 ? 'selected' : 'recommended';
  return source.map((advisor, index) => ({
    seatId: advisorPerspective(advisor) || `seat_${index + 1}`,
    advisorId: advisor.id,
    advisor,
    state: COUNCIL_STATES.has(state) ? state : 'recommended',
  }));
}

export function buildForgeReturnUrl({ sessionId, seatId, advisorId } = {}) {
  const params = new URLSearchParams();
  if (sessionId) params.set('resume', String(sessionId));
  if (seatId) params.set('seat', String(seatId));
  if (advisorId) params.set('advisor', String(advisorId));
  const query = params.toString();
  return query ? `/sandbox?${query}` : '/sandbox';
}

export default {
  acceptRecommendation,
  buildCouncilSeats,
  buildForgeReturnUrl,
  coverageDelta,
  createCouncilModel,
  replaceSeat,
  toggleAdvisor,
  advisorCardContract,
};
