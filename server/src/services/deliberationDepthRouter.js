import { buildDecisionCase } from './decisionCaseService.js';
import { buildQuickOrchestration } from './informationSufficiency.js';

const HIGH_STAKES = /辞职|创业|跳槽|offer|投资|贷款|借钱|合同|起诉|违法|胸痛|胸口疼|呼吸困难|吃药|用药|急诊|分手|结婚|搬家|买房/i;
const QUICK_EVERYDAY = /要不要吃饭|该不该吃饭|现在吃饭|吃不吃饭|要不要喝水|该不该喝水|要不要睡觉|该不该睡觉|要不要休息|该不该休息/i;
const BEHAVIOR_CHANGE = /减脂|减肥|控制体重|体重管理|控卡|暴食|节食|饮食控制/i;

export function routeDeliberationDepth(question) {
  const normalized = String(question || '').trim();
  if (HIGH_STAKES.test(normalized)) {
    return { depth: 'deep', reason: '涉及较高影响或专业风险，不能用即时建议替代完整判断', maxQuestions: 4 };
  }
  if (BEHAVIOR_CHANGE.test(normalized)) {
    return { depth: 'standard', reason: '目标已从一次即时选择扩展到体重或饮食管理，需要检查可持续性与行为模式', maxQuestions: 3 };
  }
  if (normalized.length <= 40 && QUICK_EVERYDAY.test(normalized)) {
    return { depth: 'quick', reason: '低风险、可逆的即时日常选择', maxQuestions: 3, maxRounds: 2 };
  }
  return { depth: 'standard', reason: '需要拆解取舍并核对信息', maxQuestions: 3 };
}

export function buildQuickPlan(session, orchestrated = null) {
  const depthRoute = routeDeliberationDepth(session.question || '');
  const orchestration = orchestrated?.informationFields && orchestrated?.sufficiency
    ? orchestrated
    : buildQuickOrchestration({
      question: session.question_context || session.questionContext || session.question,
      answers: session.answers,
      round: session.round,
    });
  const { informationFields, sufficiency } = orchestration;
  const askUser = sufficiency.complete || !sufficiency.nextQuestion ? [] : [sufficiency.nextQuestion].map((field) => ({
    fieldId: field.id,
    taskId: field.id,
    question: field.prompt,
    reason: field.reason,
    required: field.required,
    decisionImpact: field.decisionImpact || '',
    source: field.source || 'quick-depth-router',
    isFollowUp: field.isFollowUp === true,
  }));
  const effectiveDepth = sufficiency.escalation.changed ? sufficiency.escalation.to : depthRoute.depth;
  const plan = {
    depth: effectiveDepth,
    depthReason: sufficiency.escalation.changed ? sufficiency.escalation.reason : depthRoute.reason,
    maxQuestions: depthRoute.maxQuestions,
    dimensions: orchestration.dimensions,
    agents: orchestration.advisors,
    toolProbes: [],
    askUser,
    minFindings: effectiveDepth === 'quick' ? 1 : 2,
    round: Number(session.round || 1),
    openingLine: sufficiency.complete
      ? '关键信息已收到，演已按你的目标重新安排互补视角。'
      : '这是快推演：先补齐几项会真正改变建议的信息。',
    analysis: sufficiency.complete
      ? '快推演：信息字段已收敛，进入互补智囊条件判断。'
      : '快推演：收集身体状态、进食情境与当前目标，不预设用户饥饿。',
    informationFields,
    informationStates: sufficiency.fieldStates,
    readiness: sufficiency.readiness,
    nextQuestion: askUser[0] || null,
    orchestration: {
      depth: effectiveDepth,
      reason: sufficiency.escalation.changed ? sufficiency.escalation.reason : depthRoute.reason,
      informationFields,
      tasks: orchestration.tasks,
      advisors: [],
      escalation: sufficiency.escalation,
      manager: orchestrated?.manager || { agentId: 'orchestrator', status: 'degraded', source: 'local-structured-fallback' },
    },
  };
  plan.orchestration.advisors = plan.agents.map((agent) => ({
    id: agent.id,
    taskId: agent.taskId,
    reason: agent.reason,
  }));
  const effectiveRoute = { ...depthRoute, depth: effectiveDepth, reason: plan.depthReason };
  plan.caseFile = buildDecisionCase({ session, plan, memories: [], depthRoute: effectiveRoute });
  const nextSession = {
    ...session,
    state: sufficiency.complete ? 'READY' : 'WAIT',
    plan,
    askUser,
    memory_used: [],
    information_states: sufficiency.fieldStates,
  };
  return {
    session: nextSession,
    plan,
    askUser,
    nextQuestion: askUser[0] || null,
    readiness: sufficiency.readiness,
    informationFields: sufficiency.fieldStates,
    openingLine: plan.openingLine,
    round: plan.round,
    maxRound: depthRoute.maxRounds,
    memory: [],
  };
}

export function buildIntakePlan(session, orchestration, depthRoute = routeDeliberationDepth(session.question || '')) {
  const { informationFields, sufficiency } = orchestration;
  const nextField = sufficiency.complete ? null : sufficiency.nextQuestion;
  const askUser = nextField ? [{
    fieldId: nextField.id,
    taskId: nextField.id,
    question: nextField.prompt,
    reason: nextField.reason,
    required: nextField.required,
    decisionImpact: nextField.decisionImpact || '',
    source: nextField.source || 'adaptive-intake',
    isFollowUp: nextField.isFollowUp === true,
  }] : [];
  const plan = {
    depth: depthRoute.depth,
    depthReason: depthRoute.reason,
    maxQuestions: depthRoute.maxQuestions,
    dimensions: orchestration.dimensions,
    agents: [],
    toolProbes: [],
    askUser,
    minFindings: depthRoute.depth === 'quick' ? 1 : 2,
    round: Number(session.round || 1),
    openingLine: '演会逐项确认真正会改变判断的信息；每次只问一件事，你也可以明确保留未知。',
    analysis: '信息收集尚未完成，系统不会提前选择智囊或生成结论。',
    informationFields,
    informationStates: sufficiency.fieldStates,
    readiness: sufficiency.readiness,
    nextQuestion: askUser[0] || null,
    orchestration: {
      depth: depthRoute.depth,
      reason: depthRoute.reason,
      informationFields,
      tasks: orchestration.tasks,
      advisors: [],
      manager: { agentId: 'orchestrator', status: 'collecting', source: 'adaptive-intake' },
    },
  };
  plan.caseFile = buildDecisionCase({ session, plan, memories: [], depthRoute });
  const nextSession = {
    ...session,
    state: sufficiency.complete ? 'READY' : 'WAIT',
    plan,
    askUser,
    information_states: sufficiency.fieldStates,
    memory_used: [],
  };
  return {
    session: nextSession,
    plan,
    askUser,
    nextQuestion: askUser[0] || null,
    readiness: sufficiency.readiness,
    informationFields: sufficiency.fieldStates,
    openingLine: plan.openingLine,
    round: plan.round,
    maxRound: depthRoute.maxQuestions,
    memory: [],
  };
}

export default { routeDeliberationDepth, buildQuickPlan, buildIntakePlan };
