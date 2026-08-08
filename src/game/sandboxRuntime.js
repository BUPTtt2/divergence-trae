const SERVER_TO_VIEW_PHASE = Object.freeze({
  PLAN: 'yan_analyze',
  WAIT: 'clarify_loop',
  CLARIFY: 'clarify_loop',
  READY: 'case_file_confirm',
  EXECUTE: 'agent_debate',
  DELIBERATE: 'agent_debate',
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

export function adaptFateTicket(ticket) {
  if (!ticket?.ticketId) return null;
  const keyFindings = Array.isArray(ticket.keyFindings) ? ticket.keyFindings : [];
  return {
    ticketId: ticket.ticketId,
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
  adaptFateTicket,
  currentClarificationQuestion,
  shouldShowInteractionDock,
};
