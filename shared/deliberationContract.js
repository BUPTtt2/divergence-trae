export const DELIBERATION_EXECUTE_STATE = Object.freeze({
  CLARIFY: 'CLARIFY',
  REFLECT: 'REFLECT',
  ORACLE: 'ORACLE',
  FAILED: 'FAILED',
});

function nonEmptyString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

function uniqueIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError('agentIds must be an array');
  return [...new Set(value.map(String).map((id) => id.trim()).filter(Boolean))].slice(0, 6);
}

export function createExecuteRequest({ actionId, agentIds = [] } = {}) {
  return {
    actionId: nonEmptyString(actionId, 'actionId'),
    agentIds: uniqueIds(agentIds),
  };
}

export function parseExecuteRequest(input) {
  return createExecuteRequest(input || {});
}

export function normalizeExecuteResponse(input = {}) {
  return {
    sessionId: nonEmptyString(input.sessionId, 'sessionId'),
    state: String(input.state || DELIBERATION_EXECUTE_STATE.FAILED),
    findings: Array.isArray(input.findings) ? input.findings : [],
    oracle: input.oracle || null,
    conflicts: Array.isArray(input.conflicts) ? input.conflicts : [],
    gaps: Array.isArray(input.gaps) ? input.gaps : [],
    replanned: input.replanned === true,
    reason: String(input.reason || ''),
    dynamicChoices: Array.isArray(input.dynamicChoices) ? input.dynamicChoices : [],
    masterSummary: String(input.masterSummary || ''),
    fallback: input.fallback === true,
  };
}
