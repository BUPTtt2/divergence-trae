import { createHash } from 'node:crypto';

function descriptor(type, data, visibility = 'public') {
  return { type, data, visibility };
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[key];
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function lensInvariants(invariants = {}) {
  return {
    evidenceLocked: invariants.evidenceLocked === true,
    riskLocked: invariants.riskLocked === true,
    approvalLocked: invariants.approvalLocked === true,
    userDecisionLocked: invariants.userDecisionLocked === true,
  };
}

const TARGET_PERSPECTIVES = new Set([
  'strategic', 'communication', 'emotional', 'action', 'experience', 'risk', 'practical',
  'health', 'financial', 'reflection', 'macro', 'legal', 'education', 'technical', 'career',
  'unspecified',
]);
const PERSPECTIVE_ALIASES = Object.freeze({
  '战略': 'strategic',
  '策略': 'strategic',
  '风险': 'risk',
  '财务': 'financial',
  '行动': 'action',
  '沟通': 'communication',
  '实践': 'practical',
});

function normalizeTargetPerspective(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const candidate = PERSPECTIVE_ALIASES[normalized] || normalized;
  return TARGET_PERSPECTIVES.has(candidate) ? candidate : 'unspecified';
}

function normalizeCausalReferences(sources) {
  return [...new Set((Array.isArray(sources) ? sources : [])
    .filter((source) => typeof source === 'string')
    .map((source) => source.trim())
    .filter(Boolean)
    .map((source) => `ref_${createHash('sha256').update(source).digest('hex').slice(0, 20)}`))];
}

function lensDomainEvents(result = {}) {
  const plan = result.cognitivePlan;
  if (!Number.isInteger(plan?.lensId) || plan.lensId < 1 || plan.lensId > 64) return [];

  const tasks = uniqueBy(Array.isArray(plan.reviewTasks) ? plan.reviewTasks : [], 'id');
  const impacts = uniqueBy(Array.isArray(result.lensImpacts) ? result.lensImpacts : [], 'taskId')
    .filter((impact) => tasks.some((task) => task.id === impact.taskId));
  const events = [descriptor('LENS_SELECTED', {
    lensId: plan.lensId,
    lensName: typeof plan.lensName === 'string' ? plan.lensName : '',
    source: 'session-derived',
    sourceDigest: typeof plan.sourceDigest === 'string' ? plan.sourceDigest : '',
    invariants: lensInvariants(plan.invariants),
  }, 'summary')];

  for (const task of tasks) {
    const data = {
      taskId: task.id,
      lensId: plan.lensId,
      kind: task.kind,
      question: task.question,
      ...(Object.hasOwn(task, 'targetPerspective')
        ? { targetPerspective: normalizeTargetPerspective(task.targetPerspective) }
        : {}),
      causedBy: normalizeCausalReferences(task.causedBy),
    };
    events.push(descriptor('LENS_TASK_CREATED', data));
  }

  for (const impact of impacts) {
    events.push(descriptor('LENS_TASK_COMPLETED', {
      taskId: impact.taskId,
      lensId: plan.lensId,
      outcome: impact.outcome,
      findingIds: Array.isArray(impact.findingIds)
        ? impact.findingIds.filter((findingId) => typeof findingId === 'string')
        : [],
      summary: typeof impact.summary === 'string' ? impact.summary : '',
    }));
  }

  const changedTaskCount = impacts.filter((impact) => impact.outcome !== 'no-change').length;
  events.push(descriptor('LENS_REVIEW_COMPLETED', {
    lensId: plan.lensId,
    taskCount: tasks.length,
    impactCount: impacts.length,
    changedTaskCount,
    summary: changedTaskCount > 0
      ? `已完成 ${tasks.length} 项审查任务，其中 ${changedTaskCount} 项产生可追溯影响。`
      : `已完成 ${tasks.length} 项审查任务，未改变核心判断。`,
  }, 'summary'));
  return events;
}

export function planDomainEvents(plan = {}, askUser = []) {
  const tasks = (plan.dimensions || []).map((dimension, index) => ({
    id: dimension.id || dimension.key || `dimension_${index + 1}`,
    label: dimension.name || dimension.label || String(dimension),
    status: 'planned',
  }));
  const events = [descriptor('PLAN_CREATED', { tasks, analysis: plan.analysis || '' })];
  for (const agent of plan.agents || []) {
    events.push(descriptor('AGENT_ASSIGNED', {
      agentId: agent.id,
      agentName: agent.name,
      perspective: agent.perspective || agent.stance || '',
      taskId: agent.taskId || tasks[0]?.id || null,
    }));
  }
  for (const [index, unknown] of (askUser || []).entries()) {
    const normalized = typeof unknown === 'string' ? { question: unknown } : unknown;
    events.push(descriptor('UNKNOWN_IDENTIFIED', {
      taskId: normalized.taskId || `unknown_${index + 1}`,
      question: normalized.question || normalized.field || '待补充信息',
      reason: normalized.reason || '',
    }, 'summary'));
  }
  return events;
}

export function evidenceDomainEvent(tool, result = {}) {
  if (result.ok && result.evidence?.accepted !== false) {
    return descriptor('EVIDENCE_ACCEPTED', {
      tool,
      evidenceId: result.evidence?.id,
      summary: result.evidence?.summary || '',
      level: result.evidence?.level || null,
      sourceName: result.evidence?.sourceName || '',
      sourceUrls: result.evidence?.sourceUrls || [],
      observedAt: result.evidence?.observedAt || null,
    });
  }
  return descriptor('EVIDENCE_REJECTED', {
    tool,
    evidenceId: result.evidence?.id,
    code: result.error?.code || result.evidence?.rejectionReason || 'EVIDENCE_REJECTED',
    reason: result.error?.message || result.evidence?.rejectionReason || '证据未被采用',
  }, 'summary');
}

export function reflectionDomainEvents(result = {}) {
  const events = [];
  for (const conflict of result.conflicts || []) {
    events.push(descriptor('CLAIM_CHALLENGED', {
      claimId: conflict.claimId || conflict.id,
      challengerId: conflict.challengerId || conflict.agentId,
      reason: conflict.reason || conflict.description || String(conflict),
    }));
  }
  if (result.replanned) {
    events.push(descriptor('PLAN_REVISED', {
      reason: result.reason || '推演证据要求重新规划',
      tasks: result.tasks || [],
    }));
  }
  const choices = result.dynamicChoices || result.dynamic_choices || [];
  if (Array.isArray(choices) && choices.length > 0) {
    events.push(descriptor('APPROVAL_REQUIRED', {
      prompt: '推演已形成分岔，请选择由你确认的路径。',
      choices: choices.map((choice) => ({ id: choice.id, label: choice.label })),
    }));
  }
  if (events.length === 0 && result.masterSummary) {
    events.push(descriptor('CONSENSUS_FORMED', { summary: result.masterSummary }));
  }
  return [...events, ...lensDomainEvents(result)];
}

export function commitDomainEvents({ choice, summary = '' } = {}) {
  return [
    descriptor('DECISION_COMMITTED', { choice }),
    descriptor('SESSION_COMPLETED', { choice, summary }),
  ];
}

export default { planDomainEvents, evidenceDomainEvent, reflectionDomainEvents, commitDomainEvents };
