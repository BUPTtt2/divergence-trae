const MOTION_BY_EVENT = Object.freeze({
  PLAN_CREATED: 'plan',
  TOOL_STARTED: 'evidence-search',
  EVIDENCE_ACCEPTED: 'evidence-accepted',
  EVIDENCE_REJECTED: 'evidence-rejected',
  CLAIM_CHALLENGED: 'conflict',
  PLAN_REVISED: 'replan',
  APPROVAL_REQUIRED: 'approval',
  SESSION_COMPLETED: 'crystallize',
});

export function createArenaProjection() {
  return {
    lastSequence: 0,
    appliedEventIds: [],
    status: 'idle',
    tasks: {},
    agents: {},
    evidence: {},
    claims: {},
    conflicts: [],
    revisions: [],
    approval: null,
    summary: '',
    transport: { connected: false, replaying: false, error: null },
    motionCue: null,
  };
}

function keyedTasks(tasks = [], previous = {}) {
  const next = { ...previous };
  for (const [index, task] of tasks.entries()) {
    const normalized = typeof task === 'string' ? { id: `task_${index + 1}`, label: task } : task;
    if (!normalized?.id) continue;
    next[normalized.id] = { ...next[normalized.id], ...normalized };
  }
  return next;
}

function motionCueFor(event, replay) {
  if (replay) return null;
  const kind = MOTION_BY_EVENT[event.type];
  return kind ? { id: event.eventId, kind, sequence: event.sequence, createdAt: event.createdAt } : null;
}

export function applyAgentEvent(state, event, options = {}) {
  if (!event?.eventId || !Number.isFinite(Number(event.sequence))) return state;
  const sequence = Number(event.sequence);
  if (sequence <= state.lastSequence || state.appliedEventIds.includes(event.eventId)) return state;

  const payload = event.payload || {};
  const next = {
    ...state,
    lastSequence: sequence,
    appliedEventIds: [...state.appliedEventIds, event.eventId].slice(-500),
    motionCue: motionCueFor(event, options.replay === true),
  };

  switch (event.type) {
    case 'PLAN_CREATED':
      next.status = 'planning';
      next.tasks = keyedTasks(payload.tasks, state.tasks);
      break;
    case 'UNKNOWN_IDENTIFIED': {
      const id = payload.taskId || event.taskId || `unknown_${event.eventId}`;
      next.tasks = { ...state.tasks, [id]: { ...state.tasks[id], id, label: payload.label || payload.field || payload.question || '待补充信息', status: 'blocked', reason: payload.reason } };
      break;
    }
    case 'AGENT_ASSIGNED':
    case 'AGENT_STARTED':
    case 'AGENT_COMPLETED':
    case 'AGENT_FAILED': {
      const agentId = payload.agentId || event.actorId;
      const status = ({ AGENT_ASSIGNED: 'assigned', AGENT_STARTED: 'running', AGENT_COMPLETED: 'completed', AGENT_FAILED: 'failed' })[event.type];
      next.agents = { ...state.agents, [agentId]: { ...state.agents[agentId], ...payload, id: agentId, status, taskId: payload.taskId || event.taskId } };
      break;
    }
    case 'TOOL_STARTED':
      next.status = 'researching';
      break;
    case 'EVIDENCE_ACCEPTED':
    case 'EVIDENCE_REJECTED': {
      const evidenceId = payload.evidenceId || `evidence_${event.eventId}`;
      next.evidence = { ...state.evidence, [evidenceId]: { ...payload, id: evidenceId, accepted: event.type === 'EVIDENCE_ACCEPTED' } };
      break;
    }
    case 'CLAIM_CHALLENGED':
      next.conflicts = [...state.conflicts, { ...payload, eventId: event.eventId }].slice(-50);
      break;
    case 'CONSENSUS_FORMED': {
      const claimId = payload.claimId || `claim_${event.eventId}`;
      next.claims = { ...state.claims, [claimId]: { ...payload, id: claimId, status: 'consensus' } };
      break;
    }
    case 'PLAN_REVISED':
      next.tasks = keyedTasks(payload.tasks, state.tasks);
      next.revisions = [...state.revisions, { ...payload, eventId: event.eventId }].slice(-20);
      break;
    case 'APPROVAL_REQUIRED':
      next.status = 'awaiting-approval';
      next.approval = { ...payload, eventId: event.eventId };
      break;
    case 'DECISION_COMMITTED':
      next.status = 'committing';
      next.approval = null;
      break;
    case 'SESSION_COMPLETED':
      next.status = 'completed';
      next.summary = payload.summary || state.summary;
      next.approval = state.approval ? { ...state.approval, resolved: true } : null;
      break;
    case 'ACTION_FAILED':
    case 'AUDIT_FAILED':
      next.status = 'degraded';
      break;
    default:
      break;
  }

  return next;
}

export function applyTransportEvent(state, event) {
  switch (event?.type) {
    case 'CONNECTED':
      return { ...state, transport: { connected: true, replaying: true, error: null } };
    case 'REPLAY_COMPLETE':
      return { ...state, transport: { connected: true, replaying: false, error: null } };
    case 'STREAM_ERROR':
      return { ...state, transport: { ...state.transport, connected: false, error: event.error || 'SSE_DISCONNECTED' } };
    default:
      return state;
  }
}

export function projectSessionSnapshot(session = {}, options = {}) {
  const projection = createArenaProjection();
  const dimensions = session.plan?.dimensions || [];
  projection.tasks = keyedTasks(dimensions.map((dimension, index) => ({
    id: dimension.id || dimension.key || `dimension_${index + 1}`,
    label: dimension.name || dimension.label || String(dimension),
    status: 'restored',
  })));
  projection.agents = Object.fromEntries((session.plan?.agents || []).filter((agent) => agent?.id).map((agent) => [
    agent.id,
    { ...agent, agentId: agent.id, agentName: agent.name, status: 'restored' },
  ]));
  projection.evidence = Object.fromEntries((session.toolResults || []).map((result, index) => {
    const evidence = result?.evidence;
    const id = evidence?.id || `snapshot_evidence_${index + 1}`;
    return [id, { ...(evidence || {}), id, accepted: evidence?.accepted === true || result?.ok === true }];
  }));
  projection.conflicts = Array.isArray(session.conflicts) ? session.conflicts : [];
  projection.claims = Object.fromEntries((session.findings || []).map((finding, index) => {
    const id = finding.id || finding.claimId || `snapshot_claim_${index + 1}`;
    return [id, { ...finding, id, status: 'restored' }];
  }));
  projection.revisions = Array.from({ length: Math.min(Number(session.replanCount || 0), 20) }, (_, index) => ({
    id: `snapshot_revision_${index + 1}`,
    status: 'restored',
  }));
  projection.summary = session.masterSummary || '';
  projection.lastSequence = Number(options.lastSequence || 0);
  projection.status = ({
    PLAN: 'planning', WAIT: 'planning', EXECUTE: 'researching', DELIBERATE: 'researching',
    REFLECT: 'researching', ORACLE: 'awaiting-approval', COMMIT: 'committing', COMPLETE: 'completed',
    FAILED: 'degraded',
  })[session.state] || 'idle';
  if (session.state === 'ORACLE') {
    projection.approval = {
      prompt: '推演已形成分岔，请选择由你确认的路径。',
      choices: (session.dynamicChoices || []).map((choice) => ({ id: choice.id, label: choice.label })),
      restored: true,
    };
  }
  projection.motionCue = null;
  return projection;
}

export default { createArenaProjection, applyAgentEvent, applyTransportEvent, projectSessionSnapshot };
