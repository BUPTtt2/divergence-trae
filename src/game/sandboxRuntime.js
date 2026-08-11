import { sanitizeDecisionDisplayText } from '../utils/helpers.js';

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
  PAUSED: 'agent_debate',
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
  PAUSED: 'debate',
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

export function sessionIsPaused(session) {
  return String(session?.state || '').toUpperCase() === 'PAUSED';
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
  const clean = (value) => sanitizeDecisionDisplayText(String(value || ''));
  const cleanList = (values) => (Array.isArray(values) ? values : []).map(clean).filter(Boolean);
  return {
    ticketId: ticket.ticketId,
    question: clean(ticket.question),
    choice: clean(ticket.path?.label || ticket.choice),
    path: ticket.path ? { ...ticket.path, label: clean(ticket.path.label), keyPoints: cleanList(ticket.path.keyPoints) } : null,
    feedback: clean(ticket.feedback),
    hexagram: ticket.hexagram || null,
    timestamp: Number(ticket.timestamp) || Date.now(),
    verse: clean(ticket.oracleText),
    explanation: clean(ticket.oracleText),
    summary: clean(ticket.summary) || keyFindings.map((finding) => clean(finding.excerpt)).filter(Boolean).join('；'),
    keyPoints: (Array.isArray(ticket.nextActions) && ticket.nextActions.length > 0
      ? ticket.nextActions
      : keyFindings.map((finding) => finding.excerpt)).map(clean).filter(Boolean).slice(0, 5),
    reversalConditions: cleanList(ticket.reversalConditions),
    evidence: Array.isArray(ticket.evidence) ? ticket.evidence : [],
    contextIndex: Array.isArray(ticket.contextIndex) ? ticket.contextIndex : [],
    agentSnippets: keyFindings.map((finding) => ({
      name: clean(finding.agentName) || '智囊',
      snippet: clean(finding.excerpt),
    })),
    artwork: ticket.artwork && typeof ticket.artwork === 'object' ? ticket.artwork : null,
    cardCopy: ticket.cardCopy && typeof ticket.cardCopy === 'object' ? ticket.cardCopy : null,
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

export function resolveDirectChoice({ question, choice }) {
  const base = String(question || '').trim();
  const isStructuredChoice = choice && typeof choice === 'object';
  const selected = isStructuredChoice ? choice : { label: String(choice || '').trim() };
  const label = String(selected.label || '').trim();
  if (!base || !label) return { action: 'none', question: base };
  if (selected.action === 'none') return { action: 'none', question: base };
  if (selected.action === 'route_lookup' || label === '查证事实') {
    return { action: 'route_lookup', question: `请查证与“${base}”有关的实时事实。` };
  }
  if (!isStructuredChoice || selected.action === 'start_session') {
    return { action: 'start_session', question: `${base}。补充关注点：${label}。` };
  }
  return {
    action: 'refine_intent',
    question: base,
    intentPatch: selected.intentPatch || { focus: label },
  };
}

export function classifySessionFailure(error) {
  const status = Number(error?.status || error?.body?.status || 0);
  const code = String(error?.code || error?.body?.error || error?.message || '').toUpperCase();
  if (status === 401 || status === 404 || code.includes('SESSION_NOT_FOUND') || code.includes('AUTH_REQUIRED')) {
    return 'expired';
  }
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || status === 0) {
    return 'retryable';
  }
  return 'fatal';
}

export function resolveSessionRestore({ savedSessionId, response, error }) {
  if (response?.session?.sessionId) {
    return { kind: 'restored', session: response.session };
  }
  const failure = classifySessionFailure(error || {
    status: response?.status,
    code: response?.error || response?.code,
    message: response?.message,
  });
  if (!savedSessionId || failure === 'expired' || response?.error === 'SESSION_NOT_FOUND') {
    return {
      kind: 'expired',
      message: '原推演会话已失效，已回到新问题入口。',
    };
  }
  if (failure === 'retryable') {
    return {
      kind: 'unavailable',
      message: '服务暂不可用，可重新开始；不会使用未验证的旧案卷。',
    };
  }
  return {
    kind: 'invalid',
    message: '无法恢复原推演，已回到新问题入口。',
  };
}

export function clearExpiredSessionRecovery({
  sessionStorage,
  localStorage,
  currentUrl,
  sessionId,
}) {
  const keys = ['yance_active_deliberation_session', 'resume_session_id'];
  keys.forEach((key) => {
    try { sessionStorage?.removeItem(key); } catch {}
    try { localStorage?.removeItem(key); } catch {}
  });
  if (sessionId) {
    try { localStorage?.removeItem(`yance:sse-cursor:${sessionId}`); } catch {}
  }
  try {
    const url = new URL(currentUrl, 'http://localhost');
    url.searchParams.delete('resume');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return currentUrl;
  }
}

export function restorableSessionId({ currentUrl, storedSessionId }) {
  try {
    const urlSessionId = new URL(currentUrl, 'http://localhost').searchParams.get('resume');
    if (String(urlSessionId || '').trim()) return String(urlSessionId).trim();
  } catch {}
  return String(storedSessionId || '').trim() || null;
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
  resolveDirectChoice,
  classifySessionFailure,
  resolveSessionRestore,
  clearExpiredSessionRecovery,
  restorableSessionId,
};
