function normalizeId(value) {
  return String(value || '').trim();
}

function selectedAdvisorIds(session = {}) {
  const planIds = session?.plan?.selectedAgentIds || session?.plan?.selected_agent_ids;
  const poolIds = (session?.advisorPool || session?.advisor_pool || []).map((agent) => agent?.id);
  return [...new Set((Array.isArray(planIds) && planIds.length > 0 ? planIds : poolIds)
    .map(normalizeId)
    .filter(Boolean))];
}

function successfulFindingAgentIds(findings = [], selectedIds = []) {
  const selected = new Set(selectedIds);
  return [...new Set((Array.isArray(findings) ? findings : [])
    .filter((finding) => {
      const agentId = normalizeId(finding?.agentId || finding?.agent_id);
      const claim = String(finding?.claim || finding?.content || '').trim();
      return agentId && claim && (selected.size === 0 || selected.has(agentId));
    })
    .map((finding) => normalizeId(finding?.agentId || finding?.agent_id)))];
}

export function requiredContributionCount(depth, selectedCount) {
  const normalizedDepth = String(depth || 'standard').toLowerCase();
  if (selectedCount <= 0) return 1;
  if (normalizedDepth === 'quick') return 1;
  return selectedCount;
}

export function validateDeliberationContribution(session = {}) {
  const waivedAgentIds = [...new Set((session?.plan?.waivedAgentIds || session?.plan?.waived_agent_ids || [])
    .map(normalizeId)
    .filter(Boolean))];
  const selectedAgentIds = selectedAdvisorIds(session).filter((agentId) => !waivedAgentIds.includes(agentId));
  const successfulAgentIds = successfulFindingAgentIds(session?.findings, selectedAgentIds);
  const requiredCount = requiredContributionCount(session?.plan?.depth, selectedAgentIds.length);
  const missingAgentIds = selectedAgentIds.filter((agentId) => !successfulAgentIds.includes(agentId));
  const allowed = successfulAgentIds.length >= requiredCount;

  return {
    allowed,
    requiredCount,
    actualCount: successfulAgentIds.length,
    selectedAgentIds,
    waivedAgentIds,
    successfulAgentIds,
    missingAgentIds,
    reason: allowed
      ? '已取得足够的独立智囊结论'
      : `需要至少 ${requiredCount} 位智囊给出可追溯结论，当前仅 ${successfulAgentIds.length} 位`,
  };
}

export default { validateDeliberationContribution, requiredContributionCount };
