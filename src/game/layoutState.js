const CONVERSATION_PHASES = new Set(['casting', 'yan_analyze', 'clarify_loop', 'agent_debate']);
const DECISION_PHASES = new Set(['summary', 'branch_select', 'path_reveal', 'committing', 'final']);
const PRESENTATION_PHASES = new Set(['case_file_confirm', 'agent_select', ...DECISION_PHASES]);

export function isPresentationPhase(phase) {
  return PRESENTATION_PHASES.has(phase);
}

export function initialCompanionOpen() {
  return false;
}

export function shouldAutoOpenDecisionArtifact({ phase, viewportWidth = 1024 } = {}) {
  if (!DECISION_PHASES.has(phase)) return false;
  return !(phase === 'final' && viewportWidth <= 760);
}

export function decisionArtifactLauncherLabel(phase) {
  return phase === 'final' ? '打开命牌' : '打开案卷';
}

export function shouldRevealDestinyCard({ phase, fateRevealed = false } = {}) {
  return phase === 'final' || fateRevealed === true;
}

export function shouldMuteArena({ phase, companionOpen = false, showHistoryPanel = false } = {}) {
  return showHistoryPanel || isPresentationPhase(phase) || (companionOpen && CONVERSATION_PHASES.has(phase));
}

export function shouldShowCompanion({ phase, showHistoryPanel = false } = {}) {
  return CONVERSATION_PHASES.has(phase) && !showHistoryPanel;
}

export function companionDockOpen(open) {
  return open === true;
}

export function shouldAutoOpenCompanion({ phase, awaitingAnswers = [], answerPending = false } = {}) {
  if (phase !== 'clarify_loop' || answerPending || !Array.isArray(awaitingAnswers)) return false;
  return awaitingAnswers.some((item) => String(item?.question || item || '').trim().length > 0);
}

export function shouldShowGlobalCompass(pathname = '') {
  return !new Set(['/', '/legal', '/privacy', '/ops']).has(pathname);
}

export function sandboxLayoutClass(phase, companionOpen, decisionArtifactOpen = true) {
  if (DECISION_PHASES.has(phase) && decisionArtifactOpen) return 'decision-artifact-is-open';
  if (companionOpen && CONVERSATION_PHASES.has(phase)) return 'companion-is-open';
  return '';
}

export default sandboxLayoutClass;
