function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function answerValue(answer) {
  if (typeof answer === 'string') return cleanText(answer);
  return cleanText(answer?.answer || answer?.text || answer?.content);
}

function memoryId(memory, index) {
  return cleanText(memory?.id || memory?.memory_id || `memory_${index + 1}`, 96);
}

export function buildDecisionCase({ session = {}, plan = {}, memories = [], depthRoute = {} } = {}) {
  const answers = Array.isArray(session.answers) ? session.answers : [];
  const facts = answers.flatMap((answer, index) => {
    const value = answerValue(answer);
    if (!value) return [];
    return [{
      id: cleanText(answer?.id || `answer_${index + 1}`, 96),
      question: cleanText(answer?.question, 300),
      value,
      source: 'user',
      status: 'confirmed',
    }];
  });

  for (const [index, result] of (Array.isArray(session.tool_results) ? session.tool_results : []).entries()) {
    if (!result?.ok || result?.evidence?.accepted === false) continue;
    const value = cleanText(result.evidence?.summary || result.summary);
    if (!value) continue;
    facts.push({
      id: cleanText(result.evidence?.id || `tool_${index + 1}`, 96),
      question: cleanText(result.tool || '工具查证', 120),
      value,
      source: 'tool',
      status: 'confirmed',
    });
  }

  const unknowns = (Array.isArray(plan.askUser) ? plan.askUser : []).flatMap((unknown, index) => {
    const item = typeof unknown === 'string' ? { question: unknown } : unknown;
    const question = cleanText(item?.question || item?.field, 300);
    if (!question) return [];
    return [{
      id: cleanText(item?.taskId || item?.id || `unknown_${index + 1}`, 96),
      question,
      reason: cleanText(item?.reason, 300),
      status: 'open',
    }];
  });

  const memoryCandidates = (Array.isArray(memories) ? memories : []).flatMap((memory, index) => {
    const content = cleanText(memory?.content, 300);
    if (!content) return [];
    return [{
      id: memoryId(memory, index),
      content,
      type: cleanText(memory?.memory_type || memory?.type || 'memory', 64),
      status: 'pending',
    }];
  });

  const maxQuestions = Number(depthRoute.maxQuestions || plan.maxQuestions || 3);
  return {
    version: 1,
    objective: cleanText(session.question || session.question_context || session.questionContext, 500),
    depth: ['quick', 'standard', 'deep'].includes(depthRoute.depth) ? depthRoute.depth : 'standard',
    depthReason: cleanText(depthRoute.reason || plan.depthReason || '需要拆解取舍并核对信息', 300),
    facts,
    memoryCandidates,
    assumptions: [],
    unknowns,
    readiness: {
      status: unknowns.length > 0 ? 'collecting' : 'review',
      answeredCount: facts.filter((fact) => fact.source === 'user').length,
      maxQuestions,
      openUnknownCount: unknowns.length,
    },
    confirmedByUser: false,
    confirmedAt: null,
  };
}

export function confirmDecisionCase(draft = {}, command = {}, confirmedAt = new Date().toISOString()) {
  const accepted = new Set((Array.isArray(command.acceptedMemoryIds) ? command.acceptedMemoryIds : []).map(String));
  const additionalContext = cleanText(command.additionalContext, 1000);
  const facts = [...(Array.isArray(draft.facts) ? draft.facts : [])];
  if (additionalContext) {
    facts.push({
      id: `confirmation_${facts.length + 1}`,
      question: '用户在案卷确认时补充',
      value: additionalContext,
      source: 'user',
      status: 'confirmed',
    });
  }
  return {
    ...draft,
    facts,
    memoryCandidates: (Array.isArray(draft.memoryCandidates) ? draft.memoryCandidates : []).map((memory) => ({
      ...memory,
      status: accepted.has(String(memory.id)) ? 'accepted' : 'rejected',
    })),
    readiness: {
      ...(draft.readiness || {}),
      status: 'confirmed',
      answeredCount: facts.filter((fact) => fact.source === 'user').length,
    },
    confirmedByUser: true,
    confirmedAt,
  };
}

export function acceptedCaseContext(decisionCase = {}) {
  const facts = (Array.isArray(decisionCase.facts) ? decisionCase.facts : [])
    .map((fact) => cleanText(fact.value, 500))
    .filter(Boolean);
  const memories = (Array.isArray(decisionCase.memoryCandidates) ? decisionCase.memoryCandidates : [])
    .filter((memory) => memory.status === 'accepted')
    .map((memory) => cleanText(memory.content, 300))
    .filter(Boolean);
  return [...facts, ...memories];
}

export default { buildDecisionCase, confirmDecisionCase, acceptedCaseContext };
