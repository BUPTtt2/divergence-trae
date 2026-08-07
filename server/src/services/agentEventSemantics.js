function descriptor(type, data, visibility = 'public') {
  return { type, data, visibility };
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
  return events;
}

export function commitDomainEvents({ choice, summary = '' } = {}) {
  return [
    descriptor('DECISION_COMMITTED', { choice }),
    descriptor('SESSION_COMPLETED', { choice, summary }),
  ];
}

export default { planDomainEvents, evidenceDomainEvent, reflectionDomainEvents, commitDomainEvents };
