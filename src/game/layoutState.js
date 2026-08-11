const CONVERSATION_PHASES = new Set(['casting', 'yan_analyze', 'clarify_loop', 'agent_debate']);
const DECISION_PHASES = new Set(['summary', 'branch_select', 'path_reveal', 'committing', 'final']);
const PRESENTATION_PHASES = new Set(['case_file_confirm', 'agent_select', ...DECISION_PHASES]);

export function isPresentationPhase(phase) {
  return PRESENTATION_PHASES.has(phase);
}

export function initialCompanionOpen() {
  return false;
}

export function shouldMuteArena({ phase, companionOpen = false, showHistoryPanel = false } = {}) {
  return showHistoryPanel || isPresentationPhase(phase) || (companionOpen && CONVERSATION_PHASES.has(phase));
}

export function shouldShowGlobalCompass(pathname = '') {
  return pathname !== '/sandbox';
}

export function sandboxLayoutClass(phase, companionOpen, decisionArtifactOpen = true) {
  if (DECISION_PHASES.has(phase) && decisionArtifactOpen) return 'decision-artifact-is-open';
  if (companionOpen && CONVERSATION_PHASES.has(phase)) return 'companion-is-open';
  return '';
}

export default sandboxLayoutClass;
