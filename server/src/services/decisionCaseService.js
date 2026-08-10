function cleanText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function answerValue(answer) {
  if (typeof answer === 'string') return cleanText(answer);
  return cleanText(answer?.answer || answer?.text || answer?.content);
}

function isSkippedAnswer(value) {
  return /用户选择跳过|暂不回答|不愿回答|按现有信息继续/.test(cleanText(value));
}

function memoryId(memory, index) {
  return cleanText(memory?.id || memory?.memory_id || `memory_${index + 1}`, 96);
}

export function buildDecisionCase({ session = {}, plan = {}, memories = [], depthRoute = {} } = {}) {
  const answers = Array.isArray(session.answers) ? session.answers : [];
  const facts = answers.flatMap((answer, index) => {
    const value = answerValue(answer);
    if (!value || isSkippedAnswer(value)) return [];
    return [{
      id: cleanText(answer?.fieldId || answer?.id || `answer_${index + 1}`, 96),
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
      id: cleanText(item?.fieldId || item?.taskId || item?.id || `unknown_${index + 1}`, 96),
      question,
      reason: cleanText(item?.reason, 300),
      status: 'open',
    }];
  });
  const unknownIds = new Set(unknowns.map((unknown) => unknown.id));
  const informationFields = new Map((Array.isArray(plan.informationFields) ? plan.informationFields : [])
    .map((field) => [cleanText(field?.id, 96), field])
    .filter(([id]) => id));
  for (const answer of answers) {
    const value = answerValue(answer);
    const fieldId = cleanText(answer?.fieldId || answer?.taskId || answer?.id, 96);
    if (!fieldId || !isSkippedAnswer(value) || unknownIds.has(fieldId)) continue;
    const field = informationFields.get(fieldId);
    unknowns.push({
      id: fieldId,
      question: cleanText(field?.prompt || answer?.question || '用户暂未提供的信息', 300),
      reason: '用户选择暂不提供；结论必须保留条件，不得把它当成事实。',
      status: 'skipped',
    });
    unknownIds.add(fieldId);
  }

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
  const inferences = (Array.isArray(session.information_inferences) ? session.information_inferences : [])
    .flatMap((inference, index) => {
      const value = cleanText(inference?.value, 500);
      if (!value) return [];
      return [{
        id: cleanText(inference?.id || `inference_${index + 1}`, 96),
        fieldId: cleanText(inference?.fieldId, 96),
        value,
        confidence: Math.max(0, Math.min(1, Number(inference?.confidence) || 0)),
        evidence: cleanText(inference?.evidence, 500),
        status: 'pending',
      }];
    });
  return {
    version: 1,
    objective: cleanText(session.question || session.question_context || session.questionContext, 500),
    depth: ['quick', 'standard', 'deep'].includes(depthRoute.depth) ? depthRoute.depth : 'standard',
    depthReason: cleanText(depthRoute.reason || plan.depthReason || '需要拆解取舍并核对信息', 300),
    facts,
    inferences,
    memoryCandidates,
    assumptions: [],
    unknowns,
    readiness: {
      status: unknowns.some((unknown) => unknown.status === 'open') ? 'collecting' : 'review',
      answeredCount: facts.filter((fact) => fact.source === 'user').length,
      maxQuestions,
      openUnknownCount: unknowns.filter((unknown) => unknown.status === 'open').length,
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
