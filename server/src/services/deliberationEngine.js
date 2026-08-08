/**
 * 真 Agent 架构 Step 2/4: 推演状态机总控（DeliberationEngine）
 *
 * 状态机：PLAN → WAIT → EXECUTE → REFLECT → ORACLE → COMMIT（按文档 4.3.1 节）
 *
 * Step 4 接入自主性后：
 *   - start:  创建 session(round=1) → 调 planner.plan() → 按数据契约返回完整字段
 *             期望：信息不全时 state=WAIT + askUser 非空；信息充分时 state=EXECUTE
 *   - answer: 加载 session → 合并 answers 到 questionContext → round+1 → 重新 plan → 返回完整字段
 *             （round 硬限制 2 轮，超过则 planner 内 autonomyGate 降级 EXECUTE）
 *   - execute:占位（Step 5 实现智囊并行调用）
 *   - commit: 占位（Step 6 实现命签），当前调 memoryService.consolidate 固化记忆
 *   - getState: 读取当前状态，返回完整数据契约字段
 *
 * 统一数据契约（前端并行开发依赖）：
 *   { sessionId, state, askUser:[{question,reason,source}], plan, round, maxRound:2, openingLine, memory:[{content,type}] }
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 3.1 / 3.2 / 4.3.1 / 4.3.2 / 6.3 / 7 节
 *       docs/AUTONOMY_GATE_DESIGN.md 第 5 节
 */

import * as planner from './planner.js';
import * as memoryService from './memoryService.js';
import * as reflector from './reflector.js';
import * as agentEngine from './agentEngine.js';
import { AGENT_POOL } from '../data/agentPool.js';
import * as customAdvisorService from './customAdvisorService.js';
import logger from './logger.js';
import eventBus from './eventBus.js';
import { evaluateSession } from './evalPipeline.js';
import * as reactLoop from './reactLoop.js';
import {
  commitDomainEvents,
  lensCompletionDomainEvents,
  lensPlanDomainEvents,
  reflectionDomainEvents,
} from './agentEventSemantics.js';
import { executeLensReviewTasks } from './cognitivePerturbationService.js';
import { normalizeExecuteResponse } from '../../../shared/deliberationContract.js';
// 系统级 Agent（生产级 4 Agent）
import AuditAgentSingleton from '../agents/system/AuditAgent.js';
const _auditAttached = (() => { try { AuditAgentSingleton.ensureAttached(); } catch (e) { logger.warn('[DeliberationEngine] audit attach fail', e.message); } return true; })();

// ============ 状态枚举 ============

export const STATES = {
  PLAN: 'PLAN',
  WAIT: 'WAIT',
  EXECUTE: 'EXECUTE',
  REFLECT: 'REFLECT',
  ORACLE: 'ORACLE',
  COMMIT: 'COMMIT',
  COMPLETE: 'COMPLETE',
  PAUSED: 'PAUSED',
  FAILED: 'FAILED',
};

const MAX_ROUND = 2;
const PAUSE_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟内可 resume
const commitFlights = new Map();
const executeFlights = new Map();
const lensReviewFlights = new Map();

// ============ 工具函数 ============

/**
 * 把 planner.plan() 的返回组装成统一数据契约响应
 * @param {object} plannedSession session 对象（含 id/state/round）
 * @param {object} plan DeliberationPlan
 * @param {Array} askUser 追问数组
 * @param {string} openingLine 开场吊言
 * @param {number} round 当前轮次
 * @param {Array} memory [{content,type}]
 * @returns {object} 数据契约响应
 */
function buildResponse(plannedSession, plan, askUser, openingLine, round, memory) {
  return {
    sessionId: plannedSession.id,
    state: plannedSession.state,
    askUser: Array.isArray(askUser) ? askUser : [],
    plan: plan || { dimensions: [], toolProbes: [], askUser: [], minFindings: 3 },
    round: round || 1,
    maxRound: MAX_ROUND,
    openingLine: openingLine || '',
    memory: Array.isArray(memory) ? memory : [],
    questionType: plannedSession.questionType || '',
    analysis: plan?.analysis || '',
  };
}

/**
 * 从已加载的 session（DB 态）组装统一数据契约响应（getState 用）
 * askUser/round/openingLine 随 plan 字段持久化；memory 来自 memory_used
 * @param {object} session
 * @returns {object} 数据契约响应
 */
export function buildResponseFromSession(session) {
  const plan = session && session.plan ? session.plan : { dimensions: [], toolProbes: [], askUser: [], minFindings: 3 };
  const memoryUsed = Array.isArray(session && session.memory_used) ? session.memory_used : [];
  const askUser = Array.isArray(plan.askUser) && plan.askUser.length > 0
    ? plan.askUser
    : (Array.isArray(session && session.askUser) ? session.askUser : []);
  return {
    sessionId: session && session.id,
    state: session && session.state,
    question: session && session.question,
    askUser,
    plan,
    round: (plan && plan.round) || (session && session.round) || 1,
    replanCount: Number(session?.replan_count || 0),
    maxRound: MAX_ROUND,
    openingLine: (plan && plan.openingLine) || (session && session.openingLine) || '',
    memory: memoryUsed.map((m) => ({ content: m.content, type: m.memory_type })),
    toolResults: Array.isArray(session?.tool_results) ? session.tool_results : [],
    findings: Array.isArray(session?.findings) ? session.findings : [],
    conflicts: Array.isArray(session?.conflicts) ? session.conflicts : [],
    gaps: Array.isArray(session?.gaps) ? session.gaps : [],
    dynamicChoices: Array.isArray(session?.dynamic_choices) ? session.dynamic_choices : [],
    masterSummary: session?.master_summary || '',
    oracle: session?.oracle || null,
    cognitivePlan: session?.cognitive_plan ?? session?.cognitivePlan ?? null,
    lensImpacts: Array.isArray(session?.lens_impacts)
      ? session.lens_impacts
      : (Array.isArray(session?.lensImpacts) ? session.lensImpacts : []),
    lensReview: session?.lens_review ?? session?.lensReview ?? session?.cognitive_plan?.review ?? null,
    commitResult: session?.commit_result || null,
  };
}

/**
 * 把用户回答数组归一化为文本，合并进 questionContext（不改原问题）
 * @param {string} question 原问题
 * @param {Array} answers 用户回答数组（元素可为 string 或 {answer/text/content}）
 * @returns {string} `${question} ${answersText}`
 */
function mergeAnswersToContext(question, answers) {
  const arr = Array.isArray(answers) ? answers : [];
  const text = arr
    .map((a) => {
      if (a == null) return '';
      if (typeof a === 'string') return a;
      if (typeof a === 'object') return a.answer || a.text || a.content || '';
      return String(a);
    })
    .filter(Boolean)
    .join(' ');
  return text ? `${question} ${text}`.trim() : question;
}

function sessionNotFoundError() {
  const error = new Error('SESSION_NOT_FOUND');
  error.code = 'SESSION_NOT_FOUND';
  return error;
}

async function performLensReviewLifecycle(result, context = {}, dependencies = {}) {
  const plan = result?.cognitivePlan ?? result?.session?.cognitivePlan ?? null;
  const sessionId = context.sessionId || result.session?.id;
  const actionId = String(context.actionId || '').trim();
  const emit = dependencies.emitFn || eventBus.emit.bind(eventBus);
  for (const event of lensPlanDomainEvents({ cognitivePlan: plan, lensImpacts: [] })) {
    await emit(sessionId, { ...event, actor: 'reflector', correlationId: actionId });
  }

  const executeFn = dependencies.executeFn || executeLensReviewTasks;
  const executed = await executeFn({ session: result.session, plan, actionId });
  const totalTaskCount = Math.min(3, plan.reviewTasks.length);
  const reviewedTaskIds = new Set(plan.reviewTasks.slice(0, totalTaskCount).map((task) => task.id));
  const completedTaskIds = new Set(executed.impacts.flatMap((impact) => {
    if (!reviewedTaskIds.has(impact?.taskId)) return [];
    if (
      impact?.outcome === 'no-change'
      && typeof impact?.executionId === 'string'
      && typeof impact?.agentId === 'string'
    ) return [impact.taskId];
    if (!Array.isArray(impact?.findingIds)) return [];
    const linked = impact.findingIds.some((findingId) => executed.findings.some((finding) => (
      finding?.id === findingId
      && finding?.lensTaskId === impact.taskId
      && finding?.lensId === plan.lensId
    )));
    return linked ? [impact.taskId] : [];
  }));
  const completedTaskCount = completedTaskIds.size;
  const lensReview = {
    started: true,
    status: completedTaskCount === totalTaskCount ? 'completed' : 'pending',
    actionId,
    totalTaskCount,
    completedTaskCount,
    pendingTaskIds: [...reviewedTaskIds].filter((taskId) => !completedTaskIds.has(taskId)),
  };
  const cognitivePlan = {
    ...executed.plan,
    reviewTasks: executed.plan.reviewTasks.map((task) => reviewedTaskIds.has(task.id)
      ? { ...task, status: completedTaskIds.has(task.id) ? 'completed' : 'pending' }
      : task),
    review: lensReview,
  };
  const next = {
    ...result,
    cognitivePlan,
    lensImpacts: executed.impacts,
    lensReview,
    session: {
      ...result.session,
      findings: executed.findings,
      cognitivePlan,
      lensImpacts: executed.impacts,
      lensReview,
    },
  };
  const persist = dependencies.persistFn || (async (id, value) => memoryService.updateSessionState(
    id,
    value.session.state,
    {
      findings: value.session.findings,
      cognitive_plan: value.cognitivePlan,
      lens_impacts: value.lensImpacts,
      lens_review: value.lensReview,
    },
  ));
  await persist(sessionId, next);
  for (const event of lensCompletionDomainEvents(next)) {
    await emit(sessionId, { ...event, actor: 'reflector', correlationId: actionId });
  }
  return next;
}

export async function runLensReviewLifecycle(result, context = {}, dependencies = {}) {
  const plan = result?.cognitivePlan ?? result?.session?.cognitivePlan ?? null;
  if (!Number.isInteger(plan?.lensId) || !Array.isArray(plan?.reviewTasks) || plan.reviewTasks.length === 0) {
    return result;
  }
  if (plan.review?.started === true) return result;

  const sessionId = String(context.sessionId || result?.session?.id || '').trim();
  if (!sessionId) throw new Error('LENS_REVIEW_SESSION_REQUIRED');

  const active = lensReviewFlights.get(sessionId);
  if (active) return active;

  const flight = (async () => {
    const actionId = String(context.actionId || '').trim();
    const tasks = plan.reviewTasks.slice(0, 3);
    const lensReview = {
      started: true,
      status: 'running',
      actionId,
      totalTaskCount: tasks.length,
      completedTaskCount: 0,
      pendingTaskIds: tasks.map((task) => task.id).filter(Boolean),
    };
    const claimedPlan = {
      ...plan,
      reviewTasks: plan.reviewTasks.map((task, index) => (index < 3 ? { ...task, status: 'pending' } : task)),
      review: lensReview,
    };
    const claim = dependencies.claimFn || memoryService.claimLensReview;
    const claimResult = await claim(sessionId, { cognitivePlan: claimedPlan, lensReview, actionId });
    if (!claimResult?.claimed) {
      const persisted = claimResult?.session;
      if (!persisted) throw new Error('LENS_REVIEW_CLAIM_STATE_UNAVAILABLE');
      const persistedPlan = persisted.cognitive_plan ?? persisted.cognitivePlan ?? null;
      const persistedImpacts = persisted.lens_impacts ?? persisted.lensImpacts ?? [];
      const persistedReview = persisted.lens_review ?? persisted.lensReview ?? persistedPlan?.review ?? null;
      return {
        ...result,
        session: { ...result.session, ...persisted },
        cognitivePlan: persistedPlan,
        lensImpacts: persistedImpacts,
        lensReview: persistedReview,
        lensReviewRecovered: true,
      };
    }
    const persisted = claimResult.session || {};
    const durablePlan = persisted.cognitive_plan ?? persisted.cognitivePlan ?? claimedPlan;
    const claimedResult = {
      ...result,
      cognitivePlan: durablePlan,
      lensReview: persisted.lens_review ?? persisted.lensReview ?? lensReview,
      session: {
        ...persisted,
        ...result.session,
        cognitivePlan: durablePlan,
        lensReview: persisted.lens_review ?? persisted.lensReview ?? lensReview,
      },
    };
    return performLensReviewLifecycle(claimedResult, context, dependencies);
  })();
  lensReviewFlights.set(sessionId, flight);
  try {
    return await flight;
  } finally {
    if (lensReviewFlights.get(sessionId) === flight) lensReviewFlights.delete(sessionId);
  }
}

export async function assertSessionOwner(sessionId, verifiedUserId) {
  const userId = String(verifiedUserId || '').trim();
  const session = userId ? await memoryService.getSession(sessionId) : null;
  if (!session || session.user_id !== userId) throw sessionNotFoundError();
  return session;
}

export async function planSessionWithFallback(session, planFn = planner.plan) {
  try {
    return await planFn(session);
  } catch (error) {
    logger.warn('[Deliberation] planner 失败，保存可继续的规则兜底', { sessionId: session.id, error: error.message });
    const fallback = _fallbackPlanResult(session, error.message);
    await memoryService.saveSession({
      ...fallback.session,
      state: fallback.session.state,
      plan: fallback.plan,
    });
    return fallback;
  }
}

// ============ 主入口 ============

/**
 * 发起推演：创建 session(round=1) → 调 planner.plan() → 按数据契约返回
 * 状态流转：PLAN → WAIT（信息不全，演追问）/ EXECUTE（信息充分）
 *
 * @param {string} question 用户问题
 * @param {string} userId 用户ID
 * @returns {Promise<{sessionId, state, askUser, plan, round, maxRound, openingLine, memory}>}
 */
export async function start(question, userId) {
  logger.info('[Deliberation] start 开始', { question: (question || '').slice(0, 60), userId });

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('缺少 question 参数');
  }
  if (question.length > 500) {
    throw new Error('问题过长，请控制在500字以内');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('缺少 userId 参数');
  }

  // ========== v3.1 关键修复：先落 session，再 plan ==========
  // 即使 plan 全部失败也一定给前端返回一个有效的 sessionId，避免 500 让前端卡死
  let session = {
    user_id: userId,
    question: question.trim(),
    state: STATES.PLAN,
    replan_count: 0,
    round: 1,
  };
  // 先持久化拿到确定 id
  try {
    session = await memoryService.saveSession(session);
    logger.info('[Deliberation] session 预创建成功', { sessionId: session.id });
  } catch (e) {
    // 内存模式兜底：自造 id（极端情况下 saveSession 失败也要继续）
    session.id = session.id || `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    logger.warn('[Deliberation] saveSession 失败，使用内存态 id', { sessionId: session.id, error: e.message });
  }
  const sessionId = session.id;

  eventBus.emit(sessionId, { type: 'THOUGHT', data: { step: 'start', thought: `演·起卦：用户问「${question.trim().slice(0, 40)}」` } });

  // Planner 内部各 I/O 已有可中止超时；外层不再 Promise.race 重试，避免超时任务在后台重叠执行。
  const result = await planSessionWithFallback(session);

  // 确保 sessionId 一致（兜底时可能用的是内存态对象）
  result.session.id = result.session.id || sessionId;
  const sid = result.session.id;

  // emit 状态流转事件（try/catch 防止 eventBus 问题影响主流程）
  try {
    eventBus.emit(sid, {
      type: 'STATE_CHANGE',
      data: { from: 'PLAN', to: result.session.state, round: result.round },
    });
    eventBus.emit(sid, {
      type: 'THOUGHT',
      data: {
        step: 'planning',
        thought: result.plan?.analysis || `拆解为${result.plan?.dimensions?.length || 0}个维度`,
        dimensions: (result.plan?.dimensions || []).map(d => d.name),
      },
    });
    if (result.askUser && result.askUser.length > 0) {
      eventBus.emit(sid, {
        type: 'THOUGHT',
        data: { step: 'clarify', thought: `演·追问：${result.askUser.length}个问题` },
      });
    }
    if (result.memory && result.memory.length > 0) {
      eventBus.emit(sid, {
        type: 'OBSERVATION',
        data: { insight: `召回${result.memory.length}条记忆`, memory: result.memory.map(m => m.content?.slice(0, 30)) },
      });
    }
  } catch (busErr) {
    logger.warn('[Deliberation] eventBus 异常忽略', busErr.message);
  }

  logger.info('[Deliberation] start 完成', {
    sessionId: sid,
    state: result.session.state,
    round: result.round,
    dimCount: result.plan?.dimensions?.length || 0,
    askUserCount: result.askUser?.length || 0,
    fallback: !!result.fallback,
  });

  const resp = buildResponse(result.session, result.plan, result.askUser, result.openingLine, result.round, result.memory);
  if (result.fallback) {
    resp.fallback = true;
    resp.fallbackReason = result.fallbackReason || '';
  }
  return resp;
}

/**
 * 最后一道兜底：当 planner.plan 全部失败（超时/LLM挂），给一个合法的响应
 * 确保前端能得到 sessionId + 启发式追问 + 4 个智囊，流程继续
 */
function _fallbackPlanResult(session, errorMsg = '') {
  const q = (session.question || '').toLowerCase();
  // 启发式维度
  const dims = [];
  const add = (name, perspective) => dims.push({ name, perspective, agents: [], toolNeeds: [] });
  add('投入与成本', 'financial');
  add('风险与隐患', 'risk');
  add('长期影响', 'strategic');
  add('内心诉求', 'emotional');

  // 启发式 agent（风眼/钱谷/路向/镜渊 四核心）
  const fallbackAgents = [
    { id: 'fengyan', name: '风眼', stance: '风险视角', role: 'dynamic', trigram: '☵', color: '#A84848', glow: '#E88080' },
    { id: 'qiangu', name: '钱谷', stance: '财务视角', role: 'dynamic', trigram: '☰', color: '#C88848', glow: '#E8B880' },
    { id: 'luxiang', name: '路向', stance: '职业/趋势视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8' },
    { id: 'jingyuan', name: '镜渊', stance: '反思视角', role: 'dynamic', trigram: '☷', color: '#706088', glow: '#A890C8' },
  ];

  const round = Math.max(1, Number(session.round) || 1);
  const shouldClarify = round < MAX_ROUND;

  // 启发式追问（仅首轮；回答后的兜底必须继续进入执行，不能再次卡在 WAIT）
  const askUser = [];
  if (shouldClarify && /(租房|买房|换城市|城市|房租|房源)/.test(q)) {
    askUser.push({ question: '能接受的月预算大概是多少？', reason: '预算决定筛选范围', source: 'P0-FB' });
    askUser.push({ question: '工作/学校大概在哪个区域？期望的单程通勤时长是？', reason: '通勤是日常双输的元凶', source: 'P0-FB' });
    askUser.push({ question: '是短期过渡还是长期居住？有没有对象或家人同住？', reason: '长期/同住会改变风险评估', source: 'P0-FB' });
  } else if (shouldClarify && /(offer|工作|跳槽|创业|辞职|转行|升职|职业)/.test(q)) {
    askUser.push({ question: '你现在最看重的是收入、成长，还是稳定性？', reason: '三者不可兼得，先定权重', source: 'P0-FB' });
    askUser.push({ question: '目前的储蓄能撑多久（裸辞缓冲期）？', reason: '财务缓冲决定决策风险', source: 'P0-FB' });
  } else if (shouldClarify && /(投资|股票|基金|理财|贷款|汇率|借钱|还钱)/.test(q)) {
    askUser.push({ question: '能接受的最大亏损比例是多少？', reason: '风险承受力决定配置', source: 'P0-FB' });
    askUser.push({ question: '这笔钱多久内要用？能锁多久？', reason: '期限决定产品选择', source: 'P0-FB' });
  } else if (shouldClarify && /(感情|恋爱|结婚|分手|对象|伴侣|老公|老婆|父母|家人)/.test(q)) {
    askUser.push({ question: '你最不能接受的底线是什么？', reason: '没有底线的选择都是后悔', source: 'P0-FB' });
    askUser.push({ question: '家人/对方的态度是？', reason: '亲密关系的事不是一个人决定的', source: 'P0-FB' });
  } else if (shouldClarify) {
    askUser.push({ question: '这件事的时间限制是什么？多久之内必须决定？', reason: '时间决定信息获取深度', source: 'P0-FB' });
    askUser.push({ question: '最坏情况是什么？你能接受吗？', reason: '先判底线再谈收益', source: 'P0-FB' });
  }

  session.state = shouldClarify ? STATES.WAIT : STATES.EXECUTE;
  session.round = round;
  session.askUser = askUser;

  const plan = {
    dimensions: dims,
    agents: fallbackAgents,
    toolProbes: [],
    askUser,
    minFindings: 3,
    round,
    openingLine: `关于「${(session.question || '').slice(0, 30)}」，先问清几个关键点再推。`,
    analysis: `（LLM 暂不可用：${String(errorMsg || '').slice(0, 40)}，演已按规则生成维度与追问）`,
  };
  session.plan = plan;

  return {
    session,
    plan,
    askUser,
    openingLine: plan.openingLine,
    round,
    maxRound: MAX_ROUND,
    memory: [],
    fallback: true,
    fallbackReason: String(errorMsg || 'planner.plan failed').slice(0, 80),
  };
}

/**
 * 用户回答追问：加载 session → 合并 answers 到 questionContext → round+1 → 重新 plan → 返回
 * round 硬限制 2 轮：round 达到 3 时 planner 内 autonomyGate 返回 STOP 降级 EXECUTE
 *
 * @param {string} sessionId
 * @param {Array} answers 用户回答数组
 * @returns {Promise<{sessionId, state, askUser, plan, round, maxRound, openingLine, memory}>}
 */
export async function answer(sessionId, answers, executionCtx = {}) {
  logger.info('[Deliberation] answer 收到', { sessionId, answerCount: Array.isArray(answers) ? answers.length : 0 });

  const session = await assertSessionOwner(sessionId, executionCtx.userId);

  // round 从持久化的 plan.round 读取，+1 进入下一轮判定
  const prevRound = Number((session.plan && session.plan.round) || session.round) || 1;
  session.round = prevRound + 1;

  // 合并 answers 到 questionContext（作为补充信息，不改原问题），供 autonomyGate 重新扫描
  session.questionContext = mergeAnswersToContext(session.question, answers);
  session.answers = Array.isArray(answers) ? answers : [];

  logger.info('[Deliberation] answer 重新规划', {
    sessionId,
    prevRound,
    newRound: session.round,
    questionContext: session.questionContext.slice(0, 80),
  });

  // 重新 plan（planner 内 autonomyGate 按 session.round 判定 ASK/CONTINUE/STOP）
  const result = await planSessionWithFallback(session);

  logger.info('[Deliberation] answer 完成', {
    sessionId,
    state: result.session.state,
    round: result.round,
    dimCount: result.plan?.dimensions?.length || 0,
    askUserCount: result.askUser?.length || 0,
  });

  return buildResponse(result.session, result.plan, result.askUser, result.openingLine, result.round, result.memory);
}

/**
 * 执行推演（ReAct 循环）→ Reflect
 * v3.0 重构：演自主 Think→Act→Observe 循环，替代一次性智囊并行发言
 *   1. 加载 session，构建智囊候选池（agentIds 或 agentRouter 推荐）
 *   2. 构建 ReAct state（questionContext/plan/advisorPool/findings/toolResults）
 *   3. 调 reactLoop.runReActLoop：演自主决定 tool_call/advisor_call/ask_user/output
 *   4. 演追问则返回 CLARIFY；否则调 reflector.reflect 立卦
 *   5. 持久化 session（findings + tool_results + oracle + state）
 *
 * @param {string} sessionId
 * @param {Array} agentIds 指定调用的智囊ID（可选，作为 ReAct 候选池）
 * @param {{actionId?:string,userId?:string|null}} executionCtx 稳定动作与调用者上下文
 * @returns {Promise<{sessionId, state, findings, oracle, conflicts, gaps, replanned}>}
 */
async function performExecute(sessionId, agentIds, executionCtx, session) {
  const actionId = String(executionCtx.actionId || '').trim();
  logger.info('[Deliberation] execute 开始', { sessionId, agentIds, actionId });

  // === ★ P0 守卫：澄清未完成绝不允许启动 ReAct 循环（之前前端 SSE 抢跑 EXECUTE → DELIBERATE，就靠这一条后端双保险）
  const askUser = session.askUser || (session.plan && session.plan.askUser) || [];
  const stillNeedClarify = Array.isArray(askUser) && askUser.length > 0 && (session.state === STATES.WAIT || session.state === STATES.PLAN);
  if (stillNeedClarify) {
    // SEV2 审计记录
    try {
      if (typeof AuditAgentSingleton?.record === 'function') {
        AuditAgentSingleton.record({
          sev: 2,
          rule: 'STATE_LEAP',
          evidence: `execute 被调用但 session 仍在澄清 (state=${session.state} askUser=${askUser.length})`,
          sessionId,
        });
      }
    } catch { /* noop */ }
    logger.warn('[Deliberation] execute 被拒绝：仍在澄清阶段，需先 answerDeliberation 完成追问', { sessionId, state: session.state, askUserCount: askUser.length });
    const resp = buildResponseFromSession(session);
    resp.clarifyRequired = true;
    resp.state = 'CLARIFY';
    resp.askUser = askUser;
    return normalizeExecuteResponse(resp);
  }

  const question = session.question_context || session.questionContext || session.question || '';

  // 1. 构建智囊池：优先用传入的 agentIds（用户选择的），否则用 plan 中的 agents（演推荐的）
  //    ReAct 循环里演自主决定调哪些智囊，这里只提供候选池
  // P0-2 修复：custom(市集) 的 agentId 不在 AGENT_POOL 中，需要从 customAdvisorService 合并查询
  let userCustomAdvisors = [];
  if (session.user_id) {
    try {
      userCustomAdvisors = (await customAdvisorService.listAdvisors(session.user_id))
        .map(customAdvisorService.formatAdvisorForAgentPool?.bind(customAdvisorService) || (a => ({
          id: a.id, name: a.name, persona: a.persona, stance: a.perspective || '市集智囊',
          perspective: a.perspective || 'practical', isCustom: true, questionTypes: ['life'],
        })));
    } catch (e) {
      logger.warn('[Deliberation] 加载用户custom智囊失败，忽略', { error: e.message });
    }
  }
  const AGENT_POOL_WITH_CUSTOM = [...AGENT_POOL, ...userCustomAdvisors];
  const AGENT_MAP_WITH_CUSTOM = new Map(AGENT_POOL_WITH_CUSTOM.map(a => [a.id, a]));

  let advisorPool = [];
  if (Array.isArray(agentIds) && agentIds.length > 0) {
    advisorPool = agentIds
      .map((id) => AGENT_MAP_WITH_CUSTOM.get(id))
      .filter(Boolean);
    logger.info('[Deliberation] execute 使用用户指定智囊', {
      count: advisorPool.length, ids: agentIds,
      customCount: advisorPool.filter(a => a.isCustom).length,
      missing: agentIds.filter(id => !AGENT_MAP_WITH_CUSTOM.has(id)),
    });
  } else if (Array.isArray(session.plan?.agents) && session.plan.agents.length > 0) {
    // 用 Plan 阶段演推荐的 agents：同时从 AGENT_POOL 和 custom pool 中查（可能有 custom id）
    advisorPool = session.plan.agents
      .map((a) => AGENT_MAP_WITH_CUSTOM.get(a.id) || a)  // plan.agents里已经是完整agent对象的兜底
      .filter(Boolean);
    logger.info('[Deliberation] execute 使用演推荐智囊', { count: advisorPool.length, ids: advisorPool.map(a => a.id) });
  } else {
    // 没有用户选择也没有演推荐：调 agentEngine 自主选择（useCustomAdvisors=true 已内置查custom）
    try {
      const t0 = Date.now();
      const agentResult = await agentEngine.analyzeQuestion(question, session.user_id, { useCustomAdvisors: true });
      advisorPool = (agentResult.agentIds || [])
        .map(id => AGENT_MAP_WITH_CUSTOM.get(id))
        .filter(Boolean);
      logger.info('[Deliberation] execute agentEngine 自主选择', {
        duration: `${Date.now() - t0}ms`,
        count: advisorPool.length,
        ids: advisorPool.map(a => a.id),
      });
    } catch (e) {
      logger.warn('[Deliberation] execute agentEngine 选择失败，智囊池为空', { error: e.message });
      advisorPool = [];
    }
  }

  // 2. 构建 ReAct state（演的推演上下文，可变对象，runReActLoop 会追加 findings/toolResults/dialogue）
  const reactState = {
    sessionId,
    question: session.question,
    questionContext: question,
    plan: session.plan || { dimensions: [] },
    userId: session.user_id,
    advisorPool,
    findings: Array.isArray(session.findings) ? session.findings : [],
    toolResults: Array.isArray(session.tool_results) ? session.tool_results : [],
    dialogue: [],
    llmCallCount: 0,
    actionId,
  };

  // 3. emit 进入 DELIBERATE（Event Sourcing：事件追加为真相）
  await eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'EXECUTE', to: 'DELIBERATE', thought: '演·ReAct 推演开始' }, actor: 'yan', correlationId: actionId, visibility: 'public' });

  // 4. 运行 ReAct 循环（Think→Act→Observe，演自主决策 tool_call/advisor_call/ask_user/output）
  const reactResult = await reactLoop.runReActLoop(sessionId, reactState);

  // 5. 把 ReAct 产生的 findings/toolResults 写回 session
  session.findings = reactState.findings || [];
  session.tool_results = reactState.toolResults || [];

  // 6. 演决定追问：持久化 + 返回 CLARIFY（不预设，演基于上下文判断）
  if (reactResult.state === 'CLARIFY' && Array.isArray(reactResult.askUser) && reactResult.askUser.length > 0) {
    await memoryService.updateSessionState(sessionId, STATES.WAIT, {
      findings: session.findings,
      tool_results: session.tool_results,
    });
    logger.info('[Deliberation] execute 演追问，返回 CLARIFY', {
      sessionId,
      askUserCount: reactResult.askUser.length,
      findingsCount: session.findings.length,
    });
    return {
      sessionId,
      state: 'CLARIFY',
      askUser: reactResult.askUser,
      findings: session.findings,
    };
  }

  logger.info('[Deliberation] execute ReAct 完成，进入 REFLECT', {
    sessionId,
    findingsCount: session.findings.length,
    toolResultsCount: session.tool_results.length,
    llmCalls: reactState.llmCallCount,
  });

  // 7. Reflect（立卦或重规划）
  eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'DELIBERATE', to: 'REFLECT' } });
  eventBus.emit(sessionId, { type: 'THOUGHT', data: { step: 'reflect', thought: `演·反思：聚合${session.findings.length}位智囊发现` } });
  let result = await reflector.reflect(session);

  // Step 8: 重规划串通 — reflector 触发重规划时，自动重新 plan/execute，最多1次
  if (result.replanned && (result.session.state === 'PLAN' || result.session.state === 'EXECUTE')) {
    logger.info('[Deliberation] 触发重规划，自动串通', {
      reason: result.reason,
      newState: result.session.state,
      replanCount: result.session.replan_count,
    });
    eventBus.emit(sessionId, {
      type: 'THOUGHT',
      data: { step: 'replan', thought: `演·重规划：${result.reason}，重新析度召智` },
    });
    for (const domainEvent of reflectionDomainEvents(result)) {
      await eventBus.emit(sessionId, { ...domainEvent, actor: 'reflector', correlationId: actionId });
    }
    // 持久化当前 session（含 replan_count 和补维度）
    await memoryService.saveSession(result.session);
    // state='PLAN'：先重新 plan（planner 会读 session 已有 findings 重新规划）
    if (result.session.state === 'PLAN') {
      await planSessionWithFallback(result.session);
    }
    // 递归 execute（传空 agentIds 让 agentRouter 基于新维度推荐智囊，replan_count 已+1 不会无限）
    return performExecute(sessionId, [], executionCtx, result.session);
  }

  result = await runLensReviewLifecycle(result, { sessionId, actionId });
  if (result.lensReviewRecovered === true) return buildExecuteResponse(sessionId, result);

  // emit 反思结果
  if (result.oracle) {
    eventBus.emit(sessionId, {
      type: 'OBSERVATION',
      data: {
        insight: `立卦：${result.oracle.primary?.lower?.name || ''}${result.oracle.primary?.upper?.name || ''} · ${result.conflicts?.length || 0}处矛盾`,
      },
    });
  }
  eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'REFLECT', to: result.session?.state || 'ORACLE' } });

  // 6. 持久化
  await persistExecuteResult(sessionId, result);

  const reflectionProjection = {
    ...result,
    dynamicChoices: result.session?.dynamicChoices || [],
    masterSummary: result.session?.masterSummary || '',
  };
  for (const domainEvent of reflectionDomainEvents({ ...reflectionProjection, cognitivePlan: null, lensImpacts: [] })) {
    await eventBus.emit(sessionId, { ...domainEvent, actor: 'reflector', correlationId: actionId });
  }

  return buildExecuteResponse(sessionId, result);
}

export async function execute(sessionId, agentIds, executionCtx = {}) {
  const session = await assertSessionOwner(sessionId, executionCtx.userId);
  const persistedPlan = session.cognitive_plan ?? session.cognitivePlan ?? null;
  const persistedReview = session.lens_review ?? session.lensReview ?? persistedPlan?.review ?? null;
  if (session.state === STATES.ORACLE && persistedReview?.started === true) {
    return normalizeExecuteResponse(buildResponseFromSession(session));
  }

  const active = executeFlights.get(sessionId);
  if (active) return active;

  const flight = performExecute(sessionId, agentIds, executionCtx, session);
  executeFlights.set(sessionId, flight);
  try {
    return await flight;
  } finally {
    if (executeFlights.get(sessionId) === flight) executeFlights.delete(sessionId);
  }
}

/**
 * 持久化 execute + reflect 结果
 */
export async function persistExecuteResult(sessionId, result, dependencies = {}) {
  try {
    const updateSessionState = dependencies.updateSessionStateFn || memoryService.updateSessionState;
    const patch = {
      findings: result.session.findings || [],
      oracle: result.session.oracle || null,
      conflicts: result.conflicts || [],
      gaps: result.gaps || [],
      replan_count: result.session.replan_count ?? 0,
      cognitive_plan: result.cognitivePlan ?? result.session.cognitivePlan ?? null,
      lens_impacts: result.lensImpacts ?? result.session.lensImpacts ?? [],
      lens_review: result.lensReview ?? result.session.lensReview ?? null,
    };
    // P1-1：持久化动态抉择选项和全局总结（下次恢复推演时不丢失）
    if (result.session.dynamicChoices) patch.dynamic_choices = result.session.dynamicChoices;
    if (result.session.masterSummary != null) patch.master_summary = result.session.masterSummary;
    if (result.session.plan) {
      patch.plan = result.session.plan;
    }
    await updateSessionState(sessionId, result.session.state, patch);
    logger.info('[Deliberation] execute 持久化完成', {
      sessionId,
      state: result.session.state,
      findingsCount: patch.findings.length,
      hasOracle: !!patch.oracle,
      hasCognitivePlan: !!patch.cognitive_plan,
      lensImpactCount: patch.lens_impacts.length,
      hasDynamicChoices: Array.isArray(patch.dynamic_choices) && patch.dynamic_choices.length > 0,
    });
  } catch (e) {
    logger.warn('[Deliberation] execute 持久化失败', { sessionId, error: e.message });
    throw e;
  }
}

/**
 * 组装 execute 响应
 */
export function buildExecuteResponse(sessionId, result) {
  return normalizeExecuteResponse({
    sessionId,
    state: result.session.state,
    findings: result.session.findings || [],
    oracle: result.oracle,
    conflicts: result.conflicts,
    gaps: result.gaps,
    replanned: result.replanned,
    reason: result.reason,
    // 受控业务选项；Lens 审查任务不得进入用户提交白名单。
    dynamicChoices: Array.isArray(result.session.dynamicChoices) ? result.session.dynamicChoices : [],
    masterSummary: result.session.masterSummary || '',
    cognitivePlan: result.cognitivePlan ?? result.session.cognitivePlan ?? null,
    lensImpacts: result.lensImpacts ?? result.session.lensImpacts ?? [],
    lensReview: result.lensReview ?? result.session.lensReview ?? null,
    fallback: result.fallback === true,
  });
}

/**
 * 提交抉择：固化记忆、生成命签
 * Step 2 占位：Step 6 实现命签，当前调 memoryService.consolidate 完成记忆固化
 *
 * @param {string} sessionId
 * @param {string} choice 用户抉择
 * @param {string} feedback 用户反馈
 * @returns {Promise<{sessionId, fateTicket, memoryUpdated}>}
 */
export function commit(sessionId, choice, feedback, executionCtx = {}) {
  const actionId = String(executionCtx.actionId || '').trim();
  const existing = commitFlights.get(sessionId);
  if (existing) {
    if (existing.actionId !== actionId) {
      const error = new Error('该 Session 正在提交另一项抉择');
      error.code = 'COMMIT_IN_PROGRESS';
      return Promise.reject(error);
    }
    return existing.promise.then((result) => ({ ...result, idempotentReplay: true }));
  }

  const promise = performCommit(sessionId, choice, feedback, executionCtx);
  const flight = { actionId, promise };
  commitFlights.set(sessionId, flight);
  const cleanup = () => {
    if (commitFlights.get(sessionId) === flight) commitFlights.delete(sessionId);
  };
  promise.then(cleanup, cleanup);
  return promise;
}

async function performCommit(sessionId, choice, feedback, executionCtx = {}) {
  const actionId = String(executionCtx.actionId || '').trim();
  const requestedChoice = typeof choice === 'object' && choice
    ? String(choice.id || choice.label || '').trim()
    : String(choice || '').trim();
  logger.info('[Deliberation] commit 收到', { sessionId, choice: requestedChoice, actionId, feedback: (feedback || '').slice(0, 60) });

  const session = await assertSessionOwner(sessionId, executionCtx.userId);
  if (session.state === STATES.COMPLETE && session.commit_result) {
    const cached = typeof session.commit_result === 'string'
      ? JSON.parse(session.commit_result)
      : session.commit_result;
    if (!actionId || !cached.actionId || cached.actionId === actionId) {
      return { ...cached, idempotentReplay: true };
    }
    const error = new Error('该 Session 已完成，不能提交新的抉择');
    error.code = 'SESSION_ALREADY_COMMITTED';
    throw error;
  }
  if (session.state !== STATES.ORACLE) {
    const error = new Error(`当前状态 ${session.state} 不允许提交抉择`);
    error.code = 'INVALID_SESSION_STATE';
    throw error;
  }

  let dynamicChoices = session.dynamic_choices || session.dynamicChoices || [];
  if (typeof dynamicChoices === 'string') {
    try { dynamicChoices = JSON.parse(dynamicChoices); } catch { dynamicChoices = []; }
  }
  const selected = Array.isArray(dynamicChoices)
    ? dynamicChoices.find((item) => (
      String(item?.id || '') === requestedChoice || String(item?.label || '') === requestedChoice
    ))
    : null;
  if (!selected) {
    const error = new Error('提交的抉择不属于该 Session 的动态选项');
    error.code = 'INVALID_COMMIT_CHOICE';
    throw error;
  }
  const authoritativeChoice = String(selected.id || selected.label);

  const [decisionEvent, completedEvent] = commitDomainEvents({
    choice: authoritativeChoice,
    summary: session.master_summary || session.masterSummary || '',
  });
  await eventBus.emit(sessionId, { ...decisionEvent, actor: 'user', correlationId: actionId, visibility: 'public' });

  await eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'ORACLE', to: 'COMMIT', choice: authoritativeChoice }, actor: 'yan', correlationId: actionId, visibility: 'public' });
  eventBus.emit(sessionId, { type: 'THOUGHT', data: { step: 'commit', thought: `演·落印：用户选择「${authoritativeChoice}」` } });

  // 记录抉择（写入 session 供 consolidate 提取）
  try {
    await memoryService.updateSessionState(sessionId, STATES.COMMIT, {
      oracle: session.oracle || null,
      findings: session.findings || [],
      // choice 存到 findings 末尾便于 consolidate 读取（Step 6 会单独建列）
    });
  } catch (e) {
    logger.warn('[Deliberation] commit 状态更新失败', { error: e.message });
  }

  // 调 consolidate 固化记忆（L1→L2 摘要 + L3 命格提取）
  let memoryUpdated = false;
  try {
    const result = await memoryService.consolidate(sessionId);
    memoryUpdated = !!result;
    logger.info('[Deliberation] commit 记忆固化完成', {
      sessionId,
      summaryId: result?.summaryId,
      newMemories: result?.newMemories || 0,
    });
  } catch (e) {
    logger.warn('[Deliberation] commit 记忆固化失败', { error: e.message });
  }

  // ===== P5：推演结束 LLM 提取用户画像，写入 user_memory =====
  const userId = session.user_id;
  try {
    // 组装 qaHistory（从 session 的 answers/plan.askUser 中取）
    const qaHistory = [];
    const askUserArr = Array.isArray(session.plan?.askUser) ? session.plan.askUser : [];
    const answersArr = Array.isArray(session.answers) ? session.answers : [];
    for (let i = 0; i < Math.max(askUserArr.length, answersArr.length); i++) {
      const q = askUserArr[i]?.question || askUserArr[i] || '';
      const a = typeof answersArr[i] === 'string' ? answersArr[i] : (answersArr[i]?.answer || answersArr[i]?.text || answersArr[i]?.content || '');
      if (q || a) qaHistory.push({ question: String(q), answer: String(a) });
    }

    const findings = Array.isArray(session.findings) ? session.findings : [];

    // 已有记忆（去重参考）
    let existingMemories = [];
    try {
      existingMemories = await memoryService.listMemories(userId, 20);
    } catch {}

    const extracted = await memoryService.extractUserProfileFromDeliberation({
      question: session.question,
      qaHistory,
      findings,
      userChoice: authoritativeChoice,
      userFeedback: feedback || '',
      existingMemories,
    });

    // 批量写入 memory 表
    if (Array.isArray(extracted) && extracted.length > 0) {
      for (const mem of extracted) {
        await memoryService.upsertMemory({
          user_id: userId,
          content: mem.content,
          memory_type: mem.memory_type,
          tags: mem.tags,
          importance: mem.importance,
          source_session_id: sessionId,
        });
      }
      logger.info('[Commit] 用户画像写入完成', { userId, count: extracted.length });
      memoryUpdated = true;
    }
  } catch (e) {
    logger.warn('[Commit] 用户画像写入失败', { error: e.message });
    // 画像写入失败不影响主流程，不抛错（否则用户看不到命牌）
  }

  // Step 6: 生成命签（fateTicket）
  const fateTicket = generateFateTicket(session, authoritativeChoice, feedback);
  const commitResult = {
    sessionId,
    state: STATES.COMPLETE,
    actionId,
    fateTicket,
    memoryUpdated,
  };

  await memoryService.updateSessionState(sessionId, STATES.COMPLETE, {
    oracle: session.oracle || null,
    findings: session.findings || [],
    commit_result: commitResult,
  });
  await eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'COMMIT', to: 'COMPLETE' }, actor: 'yan', correlationId: actionId, visibility: 'public' });
  await eventBus.emit(sessionId, { ...completedEvent, actor: 'yan', correlationId: actionId, visibility: 'public' });

  eventBus.emit(sessionId, {
    type: 'OBSERVATION',
    data: { insight: `命签已生成：${fateTicket?.verse?.slice(0, 30) || ''} | 记忆固化${memoryUpdated ? '成功' : '未更新'}` },
  });

  // 推演结束，清理事件总线
  const cleanupTimer = setTimeout(() => eventBus.cleanup(sessionId), 60000);
  cleanupTimer.unref?.();

  // P1 Eval Pipeline：异步评估推演质量（不 await，失败不阻塞 commit 返回）
  evaluateSession(sessionId).catch((e) => {
    logger.warn('[Deliberation] commit evaluateSession 失败（不阻塞）', { sessionId, error: e.message });
  });

  return commitResult;
}

/**
 * 生成命签（fateTicket）
 * - 汇聚用户问题、抉择、卦象、智囊关键观点
 * - 用于前端展示、收藏、分享
 */
function generateFateTicket(session, choice, feedback) {
  const question = session.question_context || session.questionContext || session.question || '';
  const oracle = session.oracle || {};
  const findings = Array.isArray(session.findings) ? session.findings : [];

  // 提取智囊关键观点（每条取前60字摘要）
  const keyFindings = findings.slice(0, 6).map((f) => ({
    agentName: f.agentName || '未知',
    perspective: f.perspective || 'reflection',
    stance: f.stance || 'neutral',
    excerpt: (f.content || '').slice(0, 60),
  }));

  // 卦象摘要
  const hexagram = oracle.primary
    ? {
        primary: `${oracle.primary.lower?.name || ''}${oracle.primary.upper?.name || ''}`,
        changed: oracle.changed
          ? `${oracle.changed.lower?.name || ''}${oracle.changed.upper?.name || ''}`
          : '',
        dynamics: Array.isArray(oracle.dynamics) ? oracle.dynamics : [],
      }
    : null;

  return {
    ticketId: `ft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    question,
    choice: choice || '',
    feedback: feedback || '',
    hexagram,
    oracleText: oracle.text || '',
    keyFindings,
    timestamp: Date.now(),
  };
}

/**
 * 读取当前推演状态（返回完整数据契约字段）
 * @param {string} sessionId
 * @returns {Promise<object|null>} 数据契约响应对象
 */
export async function getState(sessionId, executionCtx = {}) {
  const session = await assertSessionOwner(sessionId, executionCtx.userId);
  return buildResponseFromSession(session);
}

// ============ 自检 ============

/**
 * 自检：start('我要不要去西藏') 在无记忆时触发 P0 → askUser 非空 → state=WAIT → round=1
 *
 * 跑法: cd server && node --input-type=module -e "import('./src/services/deliberationEngine.js').then(m=>m.selfTest())"
 *       （需在 server 目录、内存模式即可）
 */
export async function selfTest() {
  logger.info('=== DeliberationEngine selfTest 开始 ===');

  const question = '我要不要去西藏';
  const userId = `selftest_${Date.now()}`;

  const result = await start(question, userId);

  // Step 4 断言：travel 类无记忆 → P0 触发 → state=WAIT + askUser 非空 + round=1
  const ok =
    !!result.sessionId &&
    result.state === 'WAIT' &&
    Array.isArray(result.askUser) &&
    result.askUser.length > 0 &&
    result.round === 1 &&
    result.maxRound === 2 &&
    typeof result.openingLine === 'string' &&
    result.openingLine.length > 0 &&
    Array.isArray(result.plan?.dimensions) &&
    result.plan.dimensions.length > 0;

  logger.info('=== DeliberationEngine selfTest 结果 ===', {
    ok,
    sessionId: result.sessionId,
    state: result.state,
    round: result.round,
    maxRound: result.maxRound,
    dimCount: result.plan?.dimensions?.length || 0,
    dims: result.plan?.dimensions?.map((d) => `${d.name}(${d.perspective})`),
    askUserCount: result.askUser?.length || 0,
    askUser: result.askUser,
    openingLine: result.openingLine,
  });

  if (!ok) {
    throw new Error(`selfTest 失败：sessionId=${result.sessionId}, state=${result.state}, round=${result.round}, askUser=${JSON.stringify(result.askUser)}`);
  }

  // 验证 askUser 数据契约：每项含 question/reason/source，source ∈ P0-P4
  for (const q of result.askUser) {
    if (!q.question || !q.reason || !q.source) {
      throw new Error(`selfTest 失败：askUser 项缺字段 ${JSON.stringify(q)}`);
    }
    if (!['P0', 'P1', 'P2', 'P3', 'P4'].includes(q.source)) {
      throw new Error(`selfTest 失败：askUser.source 非法 ${q.source}`);
    }
  }

  // 验证 getState 读回完整字段
  const restored = await getState(result.sessionId, { userId });
  if (!restored || restored.sessionId !== result.sessionId) {
    throw new Error(`selfTest 失败：getState 读回异常 restored=${JSON.stringify(restored?.sessionId)}`);
  }
  if (restored.state !== 'WAIT' || restored.round !== 1) {
    throw new Error(`selfTest 失败：getState 字段异常 state=${restored.state} round=${restored.round}`);
  }

  // Step 3 校验：session.tool_results 非空（至少探测了工具）
  //   saveSession 持久化字段为 snake_case: tool_results
  const rawSession = await memoryService.getSession(result.sessionId);
  const toolResults = rawSession.tool_results || rawSession.toolResults || [];
  const toolProbeCount = Array.isArray(toolResults) ? toolResults.length : 0;
  logger.info('=== DeliberationEngine selfTest getState 校验通过 ===', {
    restoredState: restored.state,
    restoredRound: restored.round,
    restoredAskUserCount: restored.askUser?.length || 0,
    toolProbeCount,
    toolProbeOk: toolResults.filter((r) => r.ok).length,
    toolProbeSummaries: toolResults.map((r) => `${r.tool}:${r.ok ? '✓' : '✗'}`),
  });

  // travel 类问题应至少探测了工具（探测本身可能失败，但应有记录）
  if (toolProbeCount === 0) {
    throw new Error(`selfTest 失败：toolResults 为空，期望至少探测 1 个工具`);
  }

  return {
    ok,
    sessionId: result.sessionId,
    state: result.state,
    round: result.round,
    dimCount: result.plan.dimensions.length,
    askUserCount: result.askUser.length,
    askUser: result.askUser,
    openingLine: result.openingLine,
    toolProbeCount,
  };
}

/**
 * 暂停推演：把 session.state 改为 PAUSED，记录原状态与暂停时间
 * 触发场景：用户断线、用户主动暂停、app 切后台
 * @param {string} sessionId
 * @param {string} reason 暂停原因（user_disconnected/user_paused/system）
 * @returns {Promise<{sessionId, paused, reason, previousState}>}
 */
export async function pause(sessionId, reason = 'user_paused', executionCtx = {}) {
  logger.info('[Deliberation] pause', { sessionId, reason });

  const session = await assertSessionOwner(sessionId, executionCtx.userId);

  // 终态不可暂停
  const terminalStates = [STATES.COMMIT, STATES.FAILED];
  if (terminalStates.includes(session.state)) {
    logger.info('[Deliberation] pause 跳过（终态）', { sessionId, state: session.state });
    return { sessionId, paused: false, reason: '已结束，无需暂停', previousState: session.state };
  }

  // 已暂停：幂等返回
  if (session.state === STATES.PAUSED) {
    return { sessionId, paused: true, reason, previousState: (session.plan && session.plan._pausedFrom) || 'PLAN' };
  }

  const previousState = session.state || 'PLAN';
  const plan = session.plan || {};
  plan._pausedFrom = previousState;
  plan._pausedAt = Date.now();
  plan._pauseReason = reason;

  await memoryService.updateSessionState(sessionId, STATES.PAUSED, { plan });

  eventBus.emit(sessionId, {
    type: 'STATE_CHANGE',
    data: { from: previousState, to: STATES.PAUSED, reason },
  });
  eventBus.emit(sessionId, {
    type: 'THOUGHT',
    data: { step: 'pause', thought: `演·暂停推演（${reason}）` },
  });

  logger.info('[Deliberation] pause 完成', { sessionId, previousState });

  return { sessionId, paused: true, reason, previousState };
}

/**
 * 恢复推演：检查 30 分钟超时，恢复到暂停前的状态
 * @param {string} sessionId
 * @returns {Promise<{sessionId, resumed, state, previousState, canContinue}>}
 */
export async function resume(sessionId, executionCtx = {}) {
  logger.info('[Deliberation] resume', { sessionId });

  const session = await assertSessionOwner(sessionId, executionCtx.userId);

  if (session.state !== STATES.PAUSED) {
    logger.info('[Deliberation] resume 跳过（非暂停态）', { sessionId, state: session.state });
    return { sessionId, resumed: false, state: session.state, canContinue: false };
  }

  const plan = session.plan || {};
  const previousState = plan._pausedFrom || 'PLAN';
  const pausedAt = Number(plan._pausedAt) || 0;
  const elapsed = Date.now() - pausedAt;

  // 超时：转 FAILED
  if (pausedAt > 0 && elapsed > PAUSE_TIMEOUT_MS) {
    await memoryService.updateSessionState(sessionId, STATES.FAILED, { plan });
    eventBus.emit(sessionId, {
      type: 'STATE_CHANGE',
      data: { from: STATES.PAUSED, to: STATES.FAILED, reason: 'pause_timeout' },
    });
    logger.warn('[Deliberation] resume 超时，转 FAILED', { sessionId, elapsedMin: Math.floor(elapsed / 60000) });
    return { sessionId, resumed: false, state: STATES.FAILED, canContinue: false, reason: '暂停超时，需重新开始' };
  }

  // 清理暂停元信息，恢复原状态
  delete plan._pausedFrom;
  delete plan._pausedAt;
  delete plan._pauseReason;
  await memoryService.updateSessionState(sessionId, previousState, { plan });

  eventBus.emit(sessionId, {
    type: 'STATE_CHANGE',
    data: { from: STATES.PAUSED, to: previousState, reason: 'user_resumed' },
  });
  eventBus.emit(sessionId, {
    type: 'THOUGHT',
    data: { step: 'resume', thought: `演·续推（暂停前在 ${previousState}）` },
  });

  logger.info('[Deliberation] resume 完成', { sessionId, previousState });

  return {
    sessionId,
    resumed: true,
    state: previousState,
    previousState,
    canContinue: true,
    elapsedMs: elapsed,
  };
}

export default {
  STATES,
  start,
  answer,
  execute,
  commit,
  pause,
  resume,
  getState,
  selfTest,
};
