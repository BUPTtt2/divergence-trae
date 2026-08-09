import { assessInformationSufficiency } from './informationSufficiency.js';

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

function isSubstantiveToolEvidence(result, value) {
  if (!value || result?.evidence?.accepted === false) return false;
  if (/^(找到|检索到|返回)\s*\d+\s*(条|个)(结果|记录)?[。.!！]?$/.test(value)) return false;
  const citations = result?.evidence?.citations || result?.citations || result?.sources;
  const hasTraceableSource = Array.isArray(citations) && citations.length > 0;
  const hasStructuredPayload = Boolean(result?.data && typeof result.data === 'object' && Object.keys(result.data).length > 0);
  return hasTraceableSource || hasStructuredPayload || value.length >= 40;
}

export function buildDecisionCase({ session = {}, plan = {}, memories = [], depthRoute = {} } = {}) {
  const answers = Array.isArray(session.answers) ? session.answers : [];
  const informationFieldList = Array.isArray(plan.informationFields) ? plan.informationFields : [];
  const informationFields = new Map(informationFieldList
    .map((field) => [cleanText(field?.id, 96), field])
    .filter(([id]) => id));
  const informationAssessment = informationFieldList.length > 0
    ? assessInformationSufficiency({
      question: session.question || session.question_context || session.questionContext,
      answers,
      fields: informationFieldList,
      round: session.round,
    })
    : null;
  const informationStates = Array.isArray(informationAssessment?.fieldStates)
    ? informationAssessment.fieldStates
    : [];
  const informationStateById = new Map(informationStates.map((field) => [field.id, field]));
  const facts = answers.flatMap((answer, index) => {
    const value = answerValue(answer);
    if (!value || isSkippedAnswer(value)) return [];
    const fieldId = cleanText(answer?.fieldId || answer?.taskId || answer?.id, 96);
    if (informationFields.has(fieldId)) {
      const state = informationStateById.get(fieldId);
      if (state?.status !== 'answered' || state.rawValue !== value) return [];
    }
    return [{
      id: fieldId || `answer_${index + 1}`,
      question: cleanText(answer?.question, 300),
      value,
      source: 'user',
      status: 'confirmed',
    }];
  });

  for (const [index, result] of (Array.isArray(session.tool_results) ? session.tool_results : []).entries()) {
    if (!result?.ok || result?.evidence?.accepted === false) continue;
    const value = cleanText(result.evidence?.summary || result.summary);
    if (!isSubstantiveToolEvidence(result, value)) continue;
    facts.push({
      id: cleanText(result.evidence?.id || `tool_${index + 1}`, 96),
      question: cleanText(result.tool || '工具查证', 120),
      value,
      source: 'tool',
      status: 'confirmed',
    });
  }

  const unknowns = informationStates.flatMap((field) => {
    if (field.status === 'answered') return [];
    if (field.status === 'skipped') {
      return [{
        id: field.id,
        question: cleanText(field.prompt, 300),
        reason: '用户选择暂不提供；结论必须保留条件，不得把它当成事实。',
        status: 'skipped',
      }];
    }
    return [{
      id: field.id,
      question: cleanText(field.followUp || field.prompt, 300),
      reason: cleanText(field.reason, 300),
      status: field.status === 'conflicted' ? 'conflicted' : (field.status === 'ambiguous' ? 'ambiguous' : 'open'),
    }];
  });
  const unknownIds = new Set(unknowns.map((unknown) => unknown.id));
  for (const [index, label] of (Array.isArray(session.case_unknown_labels) ? session.case_unknown_labels : []).entries()) {
    const question = cleanText(label, 300);
    if (!question) continue;
    const id = `analyst_unknown_${index + 1}`;
    unknowns.push({ id, question, reason: '案卷分析 Agent 标记的延伸未知；不会在未经确认时冒充事实。', status: 'noted' });
    unknownIds.add(id);
  }
  for (const [index, unknown] of (Array.isArray(plan.askUser) ? plan.askUser : []).entries()) {
    const item = typeof unknown === 'string' ? { question: unknown } : unknown;
    const question = cleanText(item?.question || item?.field, 300);
    if (!question) continue;
    const id = cleanText(item?.fieldId || item?.taskId || item?.id || `unknown_${index + 1}`, 96);
    if (unknownIds.has(id)) continue;
    unknowns.push({
      id,
      question,
      reason: cleanText(item?.reason, 300),
      status: 'open',
    });
    unknownIds.add(id);
  }
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

  const maxQuestions = Math.max(
    Number(depthRoute.maxQuestions || 0),
    Number(plan.maxQuestions || 0),
    informationFields.size,
    3,
  );
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
  const conflicts = informationStates
    .filter((field) => field.status === 'conflicted')
    .map((field) => ({
      id: field.id,
      question: cleanText(field.prompt, 300),
      values: Array.isArray(field.conflictingValues) ? field.conflictingValues : [],
      reason: cleanText(field.reason, 300),
      status: 'open',
    }));
  const openUnknownCount = unknowns.filter((unknown) => ['open', 'ambiguous', 'conflicted'].includes(unknown.status)).length;
  const readinessStatus = conflicts.length > 0 || openUnknownCount > 0 ? 'collecting' : 'review';
  const baseReadiness = informationAssessment?.readiness || {};
  return {
    version: 1,
    objective: cleanText(session.question || session.question_context || session.questionContext, 500),
    understanding: cleanText(session.case_understanding, 800),
    depth: ['quick', 'standard', 'deep'].includes(depthRoute.depth) ? depthRoute.depth : 'standard',
    depthReason: cleanText(depthRoute.reason || plan.depthReason || '需要拆解取舍并核对信息', 300),
    facts,
    inferences,
    memoryCandidates,
    assumptions: [],
    unknowns,
    conflicts,
    readiness: {
      status: readinessStatus,
      answeredCount: facts.filter((fact) => fact.source === 'user').length,
      maxQuestions,
      openUnknownCount,
      coverage: Number(baseReadiness.coverage ?? (openUnknownCount === 0 ? 1 : 0)),
      unresolvedAmbiguities: unknowns.filter((unknown) => unknown.status === 'ambiguous').map((unknown) => unknown.id),
      unresolvedConflicts: conflicts.map((conflict) => conflict.id),
      openRequiredFields: unknowns.filter((unknown) => unknown.status === 'open').map((unknown) => unknown.id),
      authorizedUnknowns: unknowns.filter((unknown) => unknown.status === 'skipped').map((unknown) => unknown.id),
      reason: readinessStatus === 'review'
        ? '案卷没有未处理的歧义或冲突，可以交由用户复核。'
        : '案卷仍有歧义、冲突或关键未知，不能把它们当作事实。',
    },
    confirmedByUser: false,
    confirmedAt: null,
  };
}

export function confirmDecisionCase(draft = {}, command = {}, confirmedAt = new Date().toISOString()) {
  const accepted = new Set((Array.isArray(command.acceptedMemoryIds) ? command.acceptedMemoryIds : []).map(String));
  const authorizedUnknownIds = new Set((Array.isArray(command.authorizeUnknownIds) ? command.authorizeUnknownIds : []).map(String));
  const unresolvedConflicts = Array.isArray(draft.conflicts) ? draft.conflicts.filter((conflict) => conflict.status !== 'resolved') : [];
  if (unresolvedConflicts.length > 0) {
    const error = new Error('案卷仍有互相冲突的信息，请先纠正后再确认。');
    error.code = 'CASE_CONFLICTED';
    error.status = 409;
    throw error;
  }
  const unresolvedUnknowns = (Array.isArray(draft.unknowns) ? draft.unknowns : [])
    .filter((unknown) => ['open', 'ambiguous', 'conflicted'].includes(unknown.status));
  const unauthorizedUnknowns = unresolvedUnknowns.filter((unknown) => !authorizedUnknownIds.has(String(unknown.id)));
  if (draft.readiness?.status !== 'review' && unauthorizedUnknowns.length > 0) {
    const error = new Error('案卷仍有关键未知；请继续补充，或明确选择带着这些未知继续。');
    error.code = 'CASE_NOT_READY';
    error.status = 409;
    error.unknownIds = unauthorizedUnknowns.map((unknown) => unknown.id);
    throw error;
  }
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
    unknowns: (Array.isArray(draft.unknowns) ? draft.unknowns : []).map((unknown) => (
      authorizedUnknownIds.has(String(unknown.id)) && ['open', 'ambiguous'].includes(unknown.status)
        ? { ...unknown, status: 'authorized' }
        : unknown
    )),
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
