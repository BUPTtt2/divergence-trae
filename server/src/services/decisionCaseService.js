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

function questionFactLabel(value) {
  if (/预算|元|收入|工资|房租/.test(value)) return '预算与现金边界';
  if (/不确定|未定|还没|尚未/.test(value)) return '当前不确定性';
  if (/女朋友|男朋友|伴侣|父母|家人|同事/.test(value)) return '相关人与处境';
  if (/实习|工作|学习|在职|待业/.test(value)) return '当前阶段';
  return '用户已说明';
}

const INFORMATION_TOPICS = Object.freeze([
  ['budget', /预算|价格|房租|租金|收入|工资|现金|押付/],
  ['location', /地点|区域|城区|地段|地址|哪里|哪儿/],
  ['commute', /通勤|路程|距离|交通/],
  ['housing', /面积|户型|整租|合租|房型|居住形式/],
  ['people', /涉及哪些人|同住|室友|伴侣|女朋友|男朋友|家人/],
  ['timing', /多久|时间|入住|租期|期限/],
]);

function informationTopics(value) {
  const text = cleanText(value, 500);
  return INFORMATION_TOPICS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function analystUnknownAlreadyAnswered(question, facts) {
  const topics = informationTopics(question);
  if (topics.length === 0) return false;
  return facts.some((fact) => {
    const factTopics = new Set(informationTopics(`${fact.question || ''} ${fact.label || ''}`));
    return topics.some((topic) => factTopics.has(topic));
  });
}

function explicitQuestionFacts(question) {
  const clauses = cleanText(question, 1000)
    .split(/[，,；;。！？!?]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return clauses.flatMap((value, index) => {
    if (/(要不要|该不该|是否应该|是否要|怎么办|怎么选|选哪个)/.test(value)) return [];
    const assertion = /(我|我们|女朋友|男朋友|伴侣|父母|家人|目前|现在|已经|正在|预算|收入|工资|房租|通勤|转正|不确定|未定|还没|尚未|实习|工作|学习|居住)/.test(value);
    if (!assertion || value.length < 3) return [];
    return [{
      id: `question_fact_${index + 1}`,
      question: questionFactLabel(value),
      label: questionFactLabel(value),
      value,
      source: 'user-question',
      status: 'confirmed',
    }];
  });
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
  const facts = explicitQuestionFacts(session.question || session.question_context || session.questionContext);
  facts.push(...answers.flatMap((answer, index) => {
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
  }));

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
        blocking: field.blocking !== false,
        tier: cleanText(field.unknownTier || (field.blocking === false ? 'confidence' : 'blocking'), 32),
      }];
    }
    return [{
      id: field.id,
      question: cleanText(field.followUp || field.prompt, 300),
      reason: cleanText(field.reason, 300),
      status: field.status === 'conflicted' ? 'conflicted' : (field.status === 'ambiguous' ? 'ambiguous' : 'open'),
      blocking: field.blocking !== false,
      tier: cleanText(field.unknownTier || (field.blocking === false ? 'confidence' : 'blocking'), 32),
    }];
  });
  const unknownIds = new Set(unknowns.map((unknown) => unknown.id));
  for (const [index, label] of (Array.isArray(session.case_unknown_labels) ? session.case_unknown_labels : []).entries()) {
    const question = cleanText(label, 300);
    if (!question || analystUnknownAlreadyAnswered(question, facts)) continue;
    const id = `analyst_unknown_${index + 1}`;
    unknowns.push({
      id,
      question,
      reason: '案卷分析 Agent 标记的延伸未知；不会在未经确认时冒充事实。',
      status: 'noted',
      blocking: false,
      tier: 'optional',
    });
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
      blocking: item?.blocking !== false && item?.required !== false,
      tier: cleanText(item?.unknownTier || (item?.blocking === false || item?.required === false ? 'optional' : 'blocking'), 32),
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
      blocking: field?.blocking !== false,
      tier: cleanText(field?.unknownTier || (field?.blocking === false ? 'confidence' : 'blocking'), 32),
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
    .filter((field) => field.status === 'conflicted' && field.blocking !== false)
    .map((field) => ({
      id: field.id,
      question: cleanText(field.prompt, 300),
      values: Array.isArray(field.conflictingValues) ? field.conflictingValues : [],
      reason: cleanText(field.reason, 300),
      status: 'open',
    }));
  const openUnknowns = unknowns.filter((unknown) => ['open', 'ambiguous', 'conflicted'].includes(unknown.status));
  const openBlockingUnknowns = openUnknowns.filter((unknown) => unknown.blocking !== false);
  const retainedUnknowns = unknowns.filter((unknown) => unknown.blocking === false || ['noted', 'skipped'].includes(unknown.status));
  const readinessStatus = conflicts.length > 0 || openBlockingUnknowns.length > 0 ? 'collecting' : 'review';
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
      answeredCount: facts.filter((fact) => fact.source === 'user' || fact.source === 'user-question').length,
      maxQuestions,
      openUnknownCount: openUnknowns.length,
      openBlockingUnknownCount: openBlockingUnknowns.length,
      retainedUnknownCount: retainedUnknowns.length,
      coverage: Number(baseReadiness.coverage ?? (openBlockingUnknowns.length === 0 ? 1 : 0)),
      unresolvedAmbiguities: unknowns.filter((unknown) => unknown.blocking !== false && unknown.status === 'ambiguous').map((unknown) => unknown.id),
      unresolvedConflicts: conflicts.map((conflict) => conflict.id),
      openRequiredFields: openBlockingUnknowns.filter((unknown) => unknown.status === 'open').map((unknown) => unknown.id),
      authorizedUnknowns: unknowns.filter((unknown) => unknown.status === 'skipped').map((unknown) => unknown.id),
      reason: readinessStatus === 'review'
        ? '会改变推演路径的关键信息已经收敛；其余未知会作为条件保留。'
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
    .filter((unknown) => unknown.blocking !== false && ['open', 'ambiguous', 'conflicted'].includes(unknown.status));
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
  const unknowns = (Array.isArray(decisionCase.unknowns) ? decisionCase.unknowns : [])
    .filter((unknown) => unknown.status !== 'answered')
    .map((unknown) => cleanText(`未确认信息（不得当作事实）：${unknown.question || unknown.reason}`, 500))
    .filter(Boolean);
  return [...facts, ...memories, ...unknowns];
}

export default { buildDecisionCase, confirmDecisionCase, acceptedCaseContext };
