import { buildDecisionCase } from './decisionCaseService.js';

const HIGH_STAKES = /辞职|创业|跳槽|offer|投资|贷款|借钱|合同|起诉|违法|胸痛|胸口疼|呼吸困难|吃药|用药|急诊|分手|结婚|搬家|买房/i;
const QUICK_EVERYDAY = /要不要吃饭|该不该吃饭|现在吃饭|吃不吃饭|要不要喝水|该不该喝水|要不要睡觉|该不该睡觉|要不要休息|该不该休息/i;

export function routeDeliberationDepth(question) {
  const normalized = String(question || '').trim();
  if (HIGH_STAKES.test(normalized)) {
    return { depth: 'deep', reason: '涉及较高影响或专业风险，不能用即时建议替代完整判断', maxQuestions: 4 };
  }
  if (normalized.length <= 40 && QUICK_EVERYDAY.test(normalized)) {
    return { depth: 'quick', reason: '低风险、可逆的即时日常选择', maxQuestions: 1 };
  }
  return { depth: 'standard', reason: '需要拆解取舍并核对信息', maxQuestions: 3 };
}

export function buildQuickPlan(session) {
  const depthRoute = routeDeliberationDepth(session.question || '');
  const answered = Number(session.round || 1) > 1 || (Array.isArray(session.answers) && session.answers.length > 0);
  const askUser = answered ? [] : [{
    taskId: 'body_signal_check',
    question: '你现在有明显饥饿感，或距离上次正餐已经超过 4 小时吗？',
    reason: '身体信号和进食间隔足以决定这类低风险即时选择。',
    source: 'quick-depth-router',
  }];
  const plan = {
    depth: 'quick',
    depthReason: '低风险、可逆的即时日常选择',
    maxQuestions: depthRoute.maxQuestions,
    dimensions: [
      { id: 'body_signal', name: '身体信号', perspective: 'health', agents: ['jiankang'], toolNeeds: [] },
      { id: 'meal_timing', name: '时间与节律', perspective: 'practical', agents: ['jiankang'], toolNeeds: [] },
    ],
    agents: [{
      id: 'jiankang', name: '养生', stance: '健康视角', perspective: 'health', role: 'dynamic',
      taskId: 'body_signal', reason: '判断身体信号与日常节律', trigram: '☵', color: '#508870', glow: '#80C8A8',
    }],
    toolProbes: [],
    askUser,
    minFindings: 1,
    round: Number(session.round || 1),
    openingLine: answered ? '关键信息已收到，养生将给出一条带条件的行动建议。' : '这是快推演：先问一个真正会改变建议的问题。',
    analysis: answered
      ? '快推演：已收到身体状态与进食间隔，进入单智囊条件判断。'
      : '快推演：这是低风险、可逆的即时选择，不启动冗长的多智囊辩论。',
  };
  plan.caseFile = buildDecisionCase({ session, plan, memories: [], depthRoute });
  const nextSession = {
    ...session,
    state: answered ? 'READY' : 'WAIT',
    plan,
    askUser,
    memory_used: [],
  };
  return {
    session: nextSession,
    plan,
    askUser,
    openingLine: plan.openingLine,
    round: plan.round,
    maxRound: depthRoute.maxQuestions,
    memory: [],
  };
}

export default { routeDeliberationDepth, buildQuickPlan };
