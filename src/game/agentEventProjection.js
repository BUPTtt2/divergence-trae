const MOTION_BY_EVENT = Object.freeze({
  SESSION_CREATED: 'session',
  PLANNING_STARTED: 'planning',
  PLAN_CREATED: 'plan',
  CASE_DRAFTED: 'case-review',
  MEMORY_RECALLED: 'memory-review',
  CASE_CONFIRMED: 'case-confirmed',
  TOOL_STARTED: 'evidence-search',
  EVIDENCE_ACCEPTED: 'evidence-accepted',
  EVIDENCE_REJECTED: 'evidence-rejected',
  CLAIM_CHALLENGED: 'conflict',
  PLAN_REVISED: 'replan',
  APPROVAL_REQUIRED: 'approval',
  SESSION_COMPLETED: 'crystallize',
  LENS_SELECTED: 'lens-select',
  LENS_TASK_CREATED: 'lens-task',
  LENS_TASK_COMPLETED: 'lens-impact',
  LENS_REVIEW_COMPLETED: 'lens-review',
});

function activityFor(event) {
  const payload = event.payload || {};
  const copy = {
    SESSION_CREATED: ['会话已建立', payload.question || '问题已进入推演台'],
    PLANNING_STARTED: ['开始规划', payload.label || '正在辨认问题与推演深度'],
    PLAN_CREATED: ['任务已生成', payload.analysis || `已拆成 ${(payload.tasks || []).length} 项任务`],
    UNKNOWN_IDENTIFIED: ['发现信息缺口', payload.reason || payload.question || payload.label || '需要补充关键信息'],
    CASE_DRAFTED: ['案卷已形成', `${payload.factCount || 0} 项事实、${payload.unknownCount || 0} 项未知，等待你确认`],
    MEMORY_RECALLED: ['发现相关历史信息', `${payload.count || 0} 条记忆待你决定是否用于本轮`],
    CASE_CONFIRMED: ['案卷已确认', `${payload.factCount || 0} 项事实已封存，开始推演`],
    USER_INTERJECTED: [
      payload.commandType === 'CORRECTION' ? '你纠正了案卷' : payload.commandType === 'QUESTION' ? '你追问了智囊' : payload.commandType === 'PAUSE' ? '你要求暂停' : '你补充了事实',
      payload.content || '指令已进入推演队列',
    ],
    USER_CONTEXT_APPLIED: ['Agent 已读入你的补充', payload.content || '推演上下文已更新'],
    AGENT_ASSIGNED: [`${payload.agentName || '智囊'}加入推演`, payload.reason || payload.perspective || '已分配负责事项'],
    AGENT_STARTED: [`${payload.agentName || '智囊'}开始处理`, payload.taskLabel || payload.taskId || '正在执行任务'],
    AGENT_COMPLETED: [`${payload.agentName || '智囊'}完成任务`, payload.summary || payload.finding || '贡献已写入案卷'],
    AGENT_FAILED: [`${payload.agentName || '智囊'}执行失败`, payload.reason || payload.error || '主链将继续处理'],
    ADVISOR_SPEAK: [`${payload.agentName || '智囊'}提出判断`, payload.content || '公开贡献已写入案卷'],
    TOOL_STARTED: ['开始查证', payload.query || payload.tool || '正在调用证据工具'],
    EVIDENCE_ACCEPTED: ['证据已入卷', payload.summary || payload.sourceName || '来源已记录'],
    EVIDENCE_REJECTED: ['证据未采用', payload.reason || payload.code || '保留记录但不进入结论'],
    CLAIM_CHALLENGED: ['出现观点分歧', payload.reason || '一项主张受到挑战'],
    PLAN_REVISED: ['计划已调整', payload.reason || '新信息改变了任务顺序'],
    APPROVAL_REQUIRED: ['等待你的确认', payload.prompt || '下一步由你决定'],
    SESSION_COMPLETED: ['推演已收束', payload.summary || '结论与路径已经形成'],
  }[event.type];
  if (!copy) return null;
  return {
    id: event.eventId,
    type: event.type,
    title: copy[0],
    detail: copy[1],
    actorId: event.actorId,
    taskId: event.taskId || payload.taskId,
    createdAt: event.createdAt,
  };
}

function createLensProjection() {
  return { selected: null, tasks: {}, impacts: {}, review: null };
}

function projectLensFormation(formation) {
  if (!formation || !Array.isArray(formation.lines) || formation.lines.length !== 6) return null;
  const trigramName = (value) => ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑', '?'].includes(value) ? value : '?';
  const trigramPair = (value) => ({
    lowerTrigram: trigramName(value?.lowerTrigram),
    upperTrigram: trigramName(value?.upperTrigram),
  });
  return {
    primary: trigramPair(formation.primary),
    changed: trigramPair(formation.changed),
    lines: formation.lines.map((line, index) => ({
      position: index + 1,
      yinYang: line?.yinYang === 'yang' ? 'yang' : 'yin',
      knowledgeState: ['verified', 'unknown', 'contested'].includes(line?.knowledgeState)
        ? line.knowledgeState
        : 'unknown',
      perspective: /^[a-z0-9_-]{1,64}$/i.test(String(line?.perspective || ''))
        ? String(line.perspective).toLowerCase()
        : 'unspecified',
      dynamic: line?.dynamic === true,
    })),
  };
}

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
    activity: [],
    lens: createLensProjection(),
    transport: { connected: false, replaying: false, error: null },
    motionCue: null,
  };
}

function projectLensSelection(payload = {}) {
  const formation = projectLensFormation(payload.formation);
  return {
    lensId: payload.lensId,
    lensName: payload.lensName || '',
    source: payload.source || '',
    sourceDigest: payload.sourceDigest || '',
    invariants: {
      evidenceLocked: payload.invariants?.evidenceLocked === true,
      riskLocked: payload.invariants?.riskLocked === true,
      approvalLocked: payload.invariants?.approvalLocked === true,
      userDecisionLocked: payload.invariants?.userDecisionLocked === true,
    },
    ...(formation ? { formation } : {}),
  };
}

function projectLensTask(payload = {}, status = 'pending') {
  return {
    taskId: payload.taskId,
    lensId: payload.lensId,
    kind: payload.kind || '',
    question: payload.question || '',
    ...(payload.targetPerspective ? { targetPerspective: payload.targetPerspective } : {}),
    causedBy: Array.isArray(payload.causedBy) ? [...payload.causedBy] : [],
    status,
  };
}

function projectLensImpact(payload = {}) {
  return {
    taskId: payload.taskId,
    lensId: payload.lensId,
    outcome: payload.outcome || 'no-change',
    findingIds: Array.isArray(payload.findingIds) ? [...payload.findingIds] : [],
    summary: payload.summary || '',
  };
}

function projectLensReview(payload = {}) {
  return {
    lensId: payload.lensId,
    taskCount: Number(payload.taskCount || 0),
    impactCount: Number(payload.impactCount || 0),
    changedTaskCount: Number(payload.changedTaskCount || 0),
    summary: payload.summary || '',
    ...(payload.restored === true ? { restored: true } : {}),
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
  const lens = state.lens || createLensProjection();
  const next = {
    ...state,
    lastSequence: sequence,
    appliedEventIds: [...state.appliedEventIds, event.eventId].slice(-500),
    motionCue: motionCueFor(event, options.replay === true),
  };
  const activity = activityFor(event);
  if (activity) next.activity = [...(state.activity || []), activity].slice(-12);

  switch (event.type) {
    case 'SESSION_CREATED':
      next.status = 'planning';
      break;
    case 'PLANNING_STARTED':
      next.status = 'planning';
      break;
    case 'PLAN_CREATED':
      next.status = 'planning';
      next.tasks = keyedTasks(payload.tasks, state.tasks);
      break;
    case 'UNKNOWN_IDENTIFIED': {
      const id = payload.taskId || event.taskId || `unknown_${event.eventId}`;
      next.tasks = { ...state.tasks, [id]: { ...state.tasks[id], id, label: payload.label || payload.field || payload.question || '待补充信息', status: 'blocked', reason: payload.reason } };
      break;
    }
    case 'CASE_DRAFTED':
    case 'MEMORY_RECALLED':
      next.status = 'awaiting-case-confirmation';
      break;
    case 'CASE_CONFIRMED':
      next.status = 'executing';
      break;
    case 'AGENT_ASSIGNED':
    case 'AGENT_STARTED':
    case 'AGENT_COMPLETED':
    case 'AGENT_FAILED': {
      const agentId = payload.agentId || event.actorId;
      const status = ({ AGENT_ASSIGNED: 'assigned', AGENT_STARTED: 'running', AGENT_COMPLETED: 'completed', AGENT_FAILED: 'failed' })[event.type];
      next.agents = { ...state.agents, [agentId]: { ...state.agents[agentId], ...payload, id: agentId, status, taskId: payload.taskId || event.taskId } };
      break;
    }
    case 'ADVISOR_SPEAK': {
      const agentId = payload.agentId || event.actorId;
      next.agents = {
        ...state.agents,
        [agentId]: {
          ...state.agents[agentId],
          id: agentId,
          agentName: payload.agentName || state.agents[agentId]?.agentName,
          perspective: payload.perspective || state.agents[agentId]?.perspective,
          status: 'running',
          contribution: payload.content || '',
        },
      };
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
    case 'LENS_SELECTED':
      next.lens = { ...lens, selected: projectLensSelection(payload) };
      break;
    case 'LENS_TASK_CREATED': {
      if (!payload.taskId) break;
      const previousTask = lens.tasks[payload.taskId];
      const status = previousTask?.status === 'completed' ? 'completed' : 'pending';
      next.lens = {
        ...lens,
        tasks: {
          ...lens.tasks,
          [payload.taskId]: { ...previousTask, ...projectLensTask(payload, status) },
        },
      };
      break;
    }
    case 'LENS_TASK_COMPLETED': {
      if (!payload.taskId) break;
      const previousTask = lens.tasks[payload.taskId] || {};
      next.lens = {
        ...lens,
        tasks: {
          ...lens.tasks,
          [payload.taskId]: {
            ...previousTask,
            taskId: payload.taskId,
            lensId: payload.lensId ?? previousTask.lensId,
            status: 'completed',
          },
        },
        impacts: {
          ...lens.impacts,
          [payload.taskId]: projectLensImpact(payload),
        },
      };
      break;
    }
    case 'LENS_REVIEW_COMPLETED':
      next.lens = { ...lens, review: projectLensReview(payload) };
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
  const plan = session.cognitivePlan;
  if (Number.isInteger(plan?.lensId) && plan.lensId >= 1 && plan.lensId <= 64) {
    projection.lens.selected = projectLensSelection(plan);
    const impacts = {};
    for (const impact of Array.isArray(session.lensImpacts) ? session.lensImpacts : []) {
      if (!impact?.taskId || impacts[impact.taskId]) continue;
      impacts[impact.taskId] = projectLensImpact(impact);
    }
    for (const task of Array.isArray(plan.reviewTasks) ? plan.reviewTasks : []) {
      if (!task?.id || projection.lens.tasks[task.id]) continue;
      projection.lens.tasks[task.id] = projectLensTask({
        taskId: task.id,
        lensId: plan.lensId,
        kind: task.kind,
        question: task.question,
        targetPerspective: task.targetPerspective,
        causedBy: task.causedBy,
      }, impacts[task.id] ? 'completed' : 'pending');
    }
    projection.lens.impacts = Object.fromEntries(
      Object.entries(impacts).filter(([taskId]) => projection.lens.tasks[taskId]),
    );
    const persistedReview = session.lensReview ?? session.lens_review;
    if (persistedReview?.lensId === plan.lensId && typeof persistedReview.summary === 'string') {
      projection.lens.review = projectLensReview({ ...persistedReview, restored: true });
    }
  }
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
  const restoredTaskCount = Object.keys(projection.tasks).length;
  const restoredAgentCount = Object.keys(projection.agents).length;
  if (restoredTaskCount > 0 || restoredAgentCount > 0) {
    projection.activity = [{
      id: `restored_${session.sessionId || session.id || 'session'}`,
      type: 'SESSION_RESTORED',
      title: '案卷已恢复',
      detail: `${restoredTaskCount} 项任务、${restoredAgentCount} 位智囊已接回当前状态`,
      actorId: 'system',
      createdAt: '',
    }];
  }
  return projection;
}

export default { createArenaProjection, applyAgentEvent, applyTransportEvent, projectSessionSnapshot };
