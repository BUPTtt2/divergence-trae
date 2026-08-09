const CONVERSATION_PHASES = new Set(['casting', 'yan_analyze', 'clarify_loop', 'agent_debate']);
const DECISION_PHASES = new Set(['summary', 'branch_select', 'path_reveal', 'committing', 'final']);

export function sandboxLayoutClass(phase, companionOpen) {
  if (DECISION_PHASES.has(phase)) return 'decision-artifact-is-open';
  if (companionOpen && CONVERSATION_PHASES.has(phase)) return 'companion-is-open';
  return '';
}

export default sandboxLayoutClass;
