const SERVER_TO_VIEW_PHASE = Object.freeze({
  PLAN: 'yan_analyze',
  WAIT: 'clarify_loop',
  CLARIFY: 'clarify_loop',
  READY: 'case_file_confirm',
  EXECUTE: 'agent_debate',
  DELIBERATE: 'agent_debate',
  ROUND_REVIEW: 'agent_debate',
  DELIBERATION_BLOCKED: 'agent_debate',
  REFLECT: 'summary',
  ORACLE: 'summary',
  COMMIT: 'committing',
  COMPLETE: 'final',
  PAUSED: 'input',
  FAILED: 'input',
});

const SERVER_TO_INTERNAL_PHASE = Object.freeze({
  PLAN: 'summoning',
  WAIT: 'clarify',
  CLARIFY: 'clarify',
  READY: 'ready',
  EXECUTE: 'debate',
  DELIBERATE: 'debate',
  ROUND_REVIEW: 'debate',
  DELIBERATION_BLOCKED: 'debate',
  REFLECT: 'choice',
  ORACLE: 'choice',
  COMMIT: 'committing',
  COMPLETE: 'done',
  PAUSED: 'idle',
  FAILED: 'idle',
});

export function resolveSandboxRuntime(value) {
  return String(value || '').trim().toLowerCase() === 'legacy' ? 'legacy' : 'agent';
}

export function mapDeliberationPhase(state) {
  return SERVER_TO_VIEW_PHASE[String(state || '').toUpperCase()] || 'input';
}

export function mapServerStateToInternalPhase(state) {
  return SERVER_TO_INTERNAL_PHASE[String(state || '').toUpperCase()] || 'idle';
}

export function mapSessionToInternalPhase(session) {
  const state = String(session?.state || '').toUpperCase();
  if (
    state === 'EXECUTE'
    && session?.plan?.caseFile?.confirmedByUser === true
    && session?.plan?.councilStatus !== 'confirmed'
  ) {
    return 'council';
  }
  return mapServerStateToInternalPhase(state);
}

export function selectedAdvisorIdsForSession(session) {
  const plan = session?.plan || {};
  const confirmedIds = Array.isArray(plan.selectedAgentIds)
    ? plan.selectedAgentIds.filter(Boolean)
    : [];
  if (plan.councilStatus === 'confirmed' && confirmedIds.length > 0) return confirmedIds;
  return [];
}

export function shouldResumePlanning(state) {
  return String(state || '').toUpperCase() === 'PLAN';
}

export function shouldRequestPlanning({ pendingSessionId, activeSessionId, inFlightSessionId }) {
  if (!pendingSessionId || pendingSessionId !== activeSessionId) return false;
  return inFlightSessionId !== pendingSessionId;
}

export function adaptFateTicket(ticket) {
  if (!ticket?.ticketId) return null;
  const keyFindings = Array.isArray(ticket.keyFindings) ? ticket.keyFindings : [];
  return {
    ticketId: ticket.ticketId,
    question: String(ticket.question || ''),
    choice: String(ticket.choice || ''),
    feedback: String(ticket.feedback || ''),
    hexagram: ticket.hexagram || null,
    timestamp: Number(ticket.timestamp) || Date.now(),
    verse: String(ticket.oracleText || ''),
    explanation: String(ticket.oracleText || ''),
    summary: keyFindings.map((finding) => finding.excerpt).filter(Boolean).join('；'),
    keyPoints: keyFindings.map((finding) => finding.excerpt).filter(Boolean).slice(0, 4),
    agentSnippets: keyFindings.map((finding) => ({
      name: finding.agentName || '智囊',
      snippet: finding.excerpt || '',
    })),
    source: 'deliberation_session',
  };
}

export function currentClarificationQuestion(awaitingAnswers, answeredRounds) {
  const pending = Array.isArray(awaitingAnswers) ? awaitingAnswers : [];
  const firstPending = pending.find((item) => String(item?.question || item || '').trim());
  if (firstPending) return String(firstPending.question || firstPending).trim();
  const rounds = Array.isArray(answeredRounds) ? answeredRounds : [];
  return String(rounds.at(-1)?.question || '').trim();
}

export function normalizePendingClarifications(awaitingAnswers) {
  return (Array.isArray(awaitingAnswers) ? awaitingAnswers : [])
    .map((item, index) => ({
      question: String(item?.question || item || '').trim(),
      reason: String(item?.reason || '').trim(),
      fieldId: String(item?.fieldId || item?.taskId || item?.id || `question_${index + 1}`).trim(),
      required: item?.required !== false,
    }))
    .filter((item) => item.question);
}

export function clarificationInteractionState(pending) {
  return pending
    ? { heading: '正在消化你的回答', submitLabel: '正在整理案卷…', disabled: true }
    : { heading: '先补齐关键事实', submitLabel: '回答并继续', disabled: false };
}

export function shouldShowInteractionDock({ phase, awaitingUser, awaitingAnswers }) {
  const interactivePhase = ['clarify_loop', 'yan_analyze', 'agent_debate', 'summary'].includes(phase);
  if (!interactivePhase) return false;
  const hasPendingClarification = phase === 'clarify_loop'
    && Array.isArray(awaitingAnswers)
    && awaitingAnswers.some((item) => String(item?.question || item || '').trim());
  return awaitingUser === true || hasPendingClarification;
}

export default {
  resolveSandboxRuntime,
  mapDeliberationPhase,
  mapServerStateToInternalPhase,
  mapSessionToInternalPhase,
  selectedAdvisorIdsForSession,
  shouldResumePlanning,
  shouldRequestPlanning,
  adaptFateTicket,
  currentClarificationQuestion,
  normalizePendingClarifications,
  clarificationInteractionState,
  shouldShowInteractionDock,
};
