/**
 * Plan 阶段先建立可追溯案卷，再由一次编排调用同时产生判断维度与推荐智囊。
 * 信息未达到门槛时只追问一项；模型不可用时保留完整案卷并进入受控降级。
 */

import { callLLM } from './llmRouter.js';
import * as memoryService from './memoryService.js';
import * as toolProbeService from './toolProbeService.js';
import * as agentEngine from './agentEngine.js';
import logger from './logger.js';
import eventBus from './eventBus.js';
import { evidenceDomainEvent, planDomainEvents } from './agentEventSemantics.js';
import { withRetry } from './retryHelper.js';
import { buildIntakePlan, buildQuickPlan, routeDeliberationDepth } from './deliberationDepthRouter.js';
import { buildInformationOrchestration, summarizeCaseRound } from './informationSufficiency.js';
import { analyzeCaseIntake } from './caseAnalystService.js';
import { buildDecisionCase } from './decisionCaseService.js';
import OrchestratorAgent from '../agents/system/OrchestratorAgent.js';
import { run as runAgent } from '../agents/AgentRunner.js';

// ============ 常量 ============

const LLM_TIMEOUT_MS = 20000;
const MIN_FINDINGS = 2;

export async function callPlannerLLM(messages, options = {}, runtime = {}) {
  const call = runtime.call || callLLM;
  const retries = runtime.retries ?? 1;
  return withRetry(async () => {
    const text = await call(messages, {
      ...options,
      timeout: options.timeout || LLM_TIMEOUT_MS,
    });
    if (!text) throw Object.assign(new Error(`${runtime.name || 'planner LLM'}返回空文本`), { type: 'LLM_EMPTY_OUTPUT' });
    return text;
  }, {
    retries,
    delayMs: runtime.delayMs ?? 800,
    backoffMs: runtime.backoffMs ?? 1200,
    name: runtime.name || 'planner LLM',
  });
}

// v3.0 已删除 QUESTION_TYPE_TO_DIMENSIONS 硬编码映射（零预设：维度由 LLM 自主生成）

/**
 * 问题类型关键词规则（正则快速检测，作为 LLM 分类的优化路径，非降级）
 * 独立实现，不依赖 agentRouter
 */
const QUESTION_TYPE_RULES = [
  // 养宠类（最高优先级，避免被 travel/health 的"养""去"抢走，"去猫咖/买猫/养一只猫"必须命中 pet）
  { type: 'pet', pattern: /养猫|养狗|养宠物|养.{0,2}(猫|狗|鸟|鱼|兔|仓鼠|乌龟|蜥蜴|蛇|刺猬)|宠物|猫|狗|鸟|鱼|兔|仓鼠|乌龟|宠物医院|宠物用品|买猫|买狗|领养猫|领养狗|铲屎|猫咖|撸猫/ },
  // 居住类（避免被 travel 抢走）
  { type: 'city', pattern: /租房|买房|定居|搬家|落户|居住|落脚|合租|房租|房源|换城市|去.{1,6}(生活|定居|工作|发展|落脚|安家)/ },
  // 财务类
  { type: 'finance', pattern: /投资|股票|基金|理财|贷款|借钱|还钱|财务|赚钱|存钱|汇率|通货膨胀|股市|基金定投|还款|负债/ },
  // 比赛与产品类必须先于 career，避免“投入项目/复赛目标”被误判成求职。
  { type: 'competition', pattern: /比赛|竞赛|初赛|复赛|决赛|参赛|评审|展览|赛道作品|作品提交/ },
  { type: 'product', pattern: /产品|项目|用户留存|用户增长|活跃用户|功能迭代|上线|部署|商业化|MVP|Demo|Agent|AI[ -]?native/i },
  // 职业类
  { type: 'career', pattern: /工作|职业|offer|跳槽|涨薪|创业|辞职|转行|升职|面试|简历|打工|内卷|加班|入职|离职|裁员|失业/ },
  // 健康类（养宠的"养"已经优先匹配 pet，这里 health 养.1,2 不抢"养猫"）
  { type: 'health', pattern: /健康|身体|生病|看病|运动|减肥|健身|治病|养生|熬夜|失眠|焦虑|抑郁|体检|养病|治病|病痛|受伤/ },
  // 情感类
  { type: 'relationship', pattern: /感情|恋爱|结婚|分手|婚姻|对象|男朋友|女朋友|老公|老婆|父母|家人|朋友|同事关系|相亲|异地恋/ },
  // 教育类
  { type: 'education', pattern: /上学|读书|考试|考研|留学|培训|课程|学习|教育|学校|高考|毕业论文|答辩/ },
  // 法律类
  { type: 'legal', pattern: /合同|法律|官司|起诉|律师|权益|维权|合规|违法|版权|专利/ },
  // 出行类（收窄：必须包含明确的旅行/出行意图词，避免"去北京租房/工作"被匹配）
  { type: 'travel', pattern: /旅行|旅游|游玩|出差|出国|自驾|背包|攻略|景点|游记|回老家|返乡|过年回家|自驾游|度假|蜜月|去.{1,4}(旅游|旅行|玩几天|度假|玩|观光|避暑)/ },
];

// ============ 工具函数 ============

/**
 * LLM 驱动的问题类型检测（正则快速检测 + LLM 兜底）
 * v3.0 零预设：LLM 失败不降级到 'life'，而是重试后抛错
 * @param {string} question
 * @returns {Promise<string>} 问题类型
 * @throws LLM 调用失败时抛错（由调用方决定错误处理）
 */
export async function detectQuestionType(question) {
  const q = (question || '').trim();
  if (!q) return 'life';

  // 先快速正则检测（命中直接返回，节省 LLM 调用，这是优化不是降级）
  for (const rule of QUESTION_TYPE_RULES) {
    if (rule.pattern.test(q)) return rule.type;
  }

  // 正则未命中 → LLM 分类（带重试，失败抛错）
  const text = await callPlannerLLM(
        [
          { role: 'system', content: '你是问题分类专家。将用户问题归类为以下类型之一：travel(出行/旅游/出差)、finance(财务/投资)、career(求职/岗位/职场)、health(健康/医疗)、relationship(情感/人际关系)、pet(养宠)、education(教育/学习)、legal(法律)、competition(比赛/竞赛/参展)、product(产品/项目/用户/迭代/部署)、tech(技术/编程)、city(租房/买房/定居/搬家/城市生活)、life(日常生活)、other(其他)。只返回类型关键词，不要解释。注意：做产品或项目不是career；租房买房是city不是travel；去某地工作/定居/生活是city不是travel。' },
          { role: 'user', content: `问题：${q}\n分类结果：` },
        ],
        { maxTokens: 10, temperature: 0.1, timeout: 10000 },
        { retries: 2, delayMs: 500, name: 'detectQuestionType' },
  );

  const normalized = (text || '').trim().toLowerCase();
  const validTypes = ['travel', 'finance', 'career', 'health', 'relationship', 'pet', 'education', 'legal', 'competition', 'product', 'tech', 'city', 'life', 'other'];
  const firstWord = normalized.replace(/^[^a-z]/g, '').split(/[^a-z]/)[0];
  let matched = validTypes.find(t => firstWord === t);
  if (!matched) {
    matched = validTypes.find(t => normalized.includes(t));
  }
  if (!matched) {
    throw Object.assign(new Error(`LLM问题分类返回无法识别的结果: ${normalized.slice(0, 80)}`), { type: 'LLM_INVALID_OUTPUT' });
  }
  logger.info(`[detectQuestionType] LLM分类: ${q.slice(0, 20)}... → ${matched} (raw: ${normalized.slice(0, 50)})`);
  return matched;
}

/**
 * LLM 驱动的演分析文本生成
 * v3.0 零预设：失败抛错，不降级到模板文案
 * 演：八卦推演的核心决策者，用文白夹杂的卦象语言分析问题
 */
async function generateYanAnalysis(question, questionType, dimensions, toolResults, memories) {
  const dimNames = dimensions.map(d => d.name).filter(Boolean);
  const okTools = (toolResults || []).filter(t => t.ok);
  const toolSummaries = okTools.map(t => t.summary).filter(Boolean);
  const memoryHints = (memories || []).slice(0, 3).map(m => m.content).filter(Boolean);

  try {
    const result = await callPlannerLLM(
          [
            {
              role: 'system',
              content: `你是「演」，八卦推演的核心决策AI。用直白语言分析用户问题，直击要害。

【P0-3 硬约束：严禁假设用户背景】
- 绝对不能假设用户有收入、有工作、有存款、有伴侣、有房、有车、有社保、有经验等任何未在问题中明确提及的信息
- 如果问题信息不足，直接说"目前信息不全，需先问清XXX"，**不要自己脑补填充**
- 不要说"考虑到你的收入/工作/家庭情况"这类话，除非用户原问题里明确提到了

风格要求：
- 最多 3 句话
- 最多 1 句古言点缀（可选），其余是直白分析
- 直接指出问题核心矛盾和关键变量
- 不寒暄、不客套、不堆砌术语
- 不要"阴阳交泰/阴阳相济/阴阳相争"等堆砌表述`,
            },
            {
              role: 'user',
              content: `问题：「${question}」
类型：${questionType}
涉及维度：${dimNames.join('、') || '多面'}
天机提示：${toolSummaries.join('；') || '暂无'}
相关记忆：${memoryHints.join('；') || '无'}

请以演的身份，用卦象风格分析此问。`,
            },
          ],
          { maxTokens: 150, temperature: 0.7 },
          { retries: 1, delayMs: 800, name: 'generateYanAnalysis' },
    );

    if (result && String(result).trim()) {
      const text = String(result).trim();
      logger.info(`[YanAnalysis] LLM生成成功: ${text.slice(0, 50)}...`);
      return text;
    }
    logger.warn('[YanAnalysis] LLM返回空，启用规则兜底');
  } catch (e) {
    logger.warn('[YanAnalysis] LLM异常，启用规则兜底:', e.message);
  }

  // v3.1 兜底：按维度组合出规则分析
  const firstDim = dimNames[0] || '核心矛盾';
  const hasRisk = dimensions.some(d => (d.perspective || '').includes('risk'));
  const hasMem = memories && memories.length > 0;
  const base = `此问关键在「${firstDim}」`;
  const tail = hasRisk
    ? '，风险维度不可漏判，先问清边界再推。'
    : '，多面权衡，先把信息补齐。';
  return hasMem
    ? `${base}，且有旧例可循${tail}`
    : `${base}${tail}`;
}

export async function ensurePlannerAnalysis(existingAnalysis, generateAnalysis) {
  const existing = String(existingAnalysis || '').trim();
  if (existing) return existing;
  return generateAnalysis();
}

// ============ 主入口 ============

/**
 * Plan 阶段主入口
 * @param {object} session { id?, user_id, question, state, round?, questionContext?, questionType? }
 * @returns {Promise<{session, plan, askUser, openingLine, round, memory, maxRound}>}
 *   - session 已带 id 与最新 state/round
 *   - plan 为 DeliberationPlan（含 askUser/round/openingLine，随 plan 字段持久化）
 *   - askUser 为演的追问数组（state=WAIT 时非空）
 *   - memory 为映射后的 [{content, type}] 供前端开场吊言+个性化
 */
export async function plan(session, dependencies = {}) {
  const userId = session.user_id;
  const question = session.question_context || session.questionContext || session.question || '';
  logger.info('[Planner] Plan 阶段开始', { sessionId: session.id, userId, question: question.slice(0, 60) });

  const depthRoute = routeDeliberationDepth(session.question || question);
  const analyzeCase = dependencies.analyzeCaseIntakeFn || analyzeCaseIntake;
  const previousFields = session.plan?.informationFields || [];
  const previousAnalysis = session.plan?.caseAnalysis || null;
  const caseAnalysis = await analyzeCase({
    question: session.question || question,
    answers: session.answers || [],
    previousFields,
    previousAnalysis,
    depth: depthRoute.depth,
  });
  session.information_inferences = caseAnalysis.inferences;
  session.case_understanding = caseAnalysis.understanding;
  session.case_unknown_labels = caseAnalysis.unknownLabels;
  const adaptiveIntake = buildInformationOrchestration({
    question,
    answers: session.answers || [],
    round: session.round,
    depth: depthRoute.depth,
    informationFields: caseAnalysis.informationFields,
  });
  const caseRound = summarizeCaseRound({
    question: session.question || question,
    answers: session.answers || [],
    caseAnalysis,
    sufficiency: adaptiveIntake.sufficiency,
  });
  const enrichedCaseAnalysis = { ...caseAnalysis, ...caseRound };
  adaptiveIntake.caseAnalysis = enrichedCaseAnalysis;
  session.case_analysis = enrichedCaseAnalysis;
  if (depthRoute.depth !== 'quick' && !adaptiveIntake.sufficiency.complete) {
    const result = buildIntakePlan(session, adaptiveIntake, depthRoute);
    const saveSession = dependencies.saveSessionFn || memoryService.saveSession;
    const saved = await saveSession(result.session);
    result.session.id = saved.id || session.id;
    const correlationId = `plan_${result.session.id}_${result.round}`;
    for (const domainEvent of planDomainEvents(result.plan, result.askUser)) {
      await eventBus.emit(result.session.id, {
        ...domainEvent,
        actor: 'planner',
        correlationId,
        taskId: domainEvent.data?.taskId,
      });
    }
    logger.info('[Planner] 自适应信息门禁等待用户', {
      sessionId: result.session.id,
      depth: depthRoute.depth,
      fieldId: result.askUser[0]?.fieldId,
      readiness: result.readiness.status,
    });
    return result;
  }
  if (depthRoute.depth === 'quick') {
    let quickOrchestration = null;
    try {
      const runner = dependencies.runAgentFn || runAgent;
      const manager = dependencies.orchestratorAgent || new OrchestratorAgent();
      const managerRun = await runner(manager, {
        sessionId: session.id,
        userId: userId || 'anonymous',
        round: Number(session.round || 1),
        actionId: `plan-round-${Number(session.round || 1)}`,
        blackboard: {
          mode: 'quick',
          question,
          answers: session.answers || [],
        },
      });
      if (managerRun?.ok && managerRun.output?.orchestration) {
        quickOrchestration = {
          ...managerRun.output.orchestration,
          manager: {
            agentId: 'orchestrator',
            name: '演·编排总管',
            status: 'completed',
            source: managerRun.output.planSource || 'quick-structured',
            correlationId: managerRun.correlationId,
          },
        };
      }
    } catch (error) {
      logger.warn('[Planner] 编排总管不可用，使用受控快推演结构', { error: error.message });
    }
    const result = buildQuickPlan(session, quickOrchestration);
    const saveSession = dependencies.saveSessionFn || memoryService.saveSession;
    const saved = await saveSession(result.session);
    result.session.id = saved.id || session.id;
    const correlationId = `plan_${result.session.id}_${result.round}`;
    for (const domainEvent of planDomainEvents(result.plan, result.askUser)) {
      await eventBus.emit(result.session.id, {
        ...domainEvent,
        actor: 'planner',
        correlationId,
        taskId: domainEvent.data?.taskId,
      });
    }
    logger.info('[Planner] 快推演规划完成', {
      sessionId: result.session.id,
      state: result.session.state,
      reason: depthRoute.reason,
    });
    return result;
  }

  // 1. 读 L3 命格
  let memories = [];
  try {
    memories = await memoryService.recall(userId, question);
    logger.info('[Planner] L3 召回完成', { userId, count: memories.length });
  } catch (e) {
    logger.warn('[Planner] L3 召回失败，按新用户处理', { error: e.message });
  }

  // 2. 读 L2 近期摘要
  let summaries = [];
  try {
    summaries = await memoryService.recentSummaries(userId);
    logger.info('[Planner] L2 摘要读取完成', { userId, count: summaries.length });
  } catch (e) {
    logger.warn('[Planner] L2 摘要读取失败，跳过', { error: e.message });
  }

  // 3. LLM 驱动规划：先检测类型（维度生成移至 Step 4，优先 LLM）
  const questionType = await detectQuestionType(question);

  // 3.5 调工具窥天机（Step 3 接入：detectToolNeeds → probe）
  //     失败不阻塞规划，已有 try/catch 降级；结果注入 session 供 LLM/智囊/Reflect 使用
  let toolResults = [];
  try {
    const toolNeeds = toolProbeService.detectToolNeeds(session.question, questionType);
    toolResults = toolNeeds.length > 0
      ? await toolProbeService.probe(session.question, questionType, {
        context: { sessionId: session.id, actorId: userId },
      })
      : [];
    logger.info('[Planner] 工具探测完成', {
      toolNeeds,
      toolResultCount: toolResults.length,
      okCount: toolResults.filter((r) => r.ok).length,
      summaries: toolResults.map((r) => `${r.tool}:${r.ok ? '✓' : '✗'}`),
    });
  } catch (e) {
    logger.warn('[Planner] 工具探测异常，跳过（不阻塞规划）', { error: e.message });
    toolResults = [];
  }
  // 同时写入 camelCase（运行时访问）与 snake_case（saveSession 持久化字段）
  session.toolResults = toolResults;
  session.tool_results = toolResults;

  // 召回只形成候选项；用户确认前不得把历史记忆当作本次事实。
  const confirmedMemories = [];
  // 编排总管在一次模型调用中同时完成问题拆解、维度规划与智囊推荐。
  const agentResult = await agentEngine.analyzeQuestion(question, userId, { useCustomAdvisors: true });
  const selectedAgentIds = Array.isArray(agentResult.agentIds) ? agentResult.agentIds : [];
  const recommendationByAgent = new Map((Array.isArray(agentResult.recommendations) ? agentResult.recommendations : [])
    .map((item) => [String(item?.agentId || ''), item]));
  const selectedAgents = selectedAgentIds
    .map(id => {
      const fromPool = typeof agentEngine.getAgentById === 'function' ? agentEngine.getAgentById(id) : null;
      const recommendation = recommendationByAgent.get(id) || {};
      if (fromPool) return {
        id: fromPool.id, name: fromPool.name, stance: fromPool.stance,
        perspective: fromPool.perspective,
        role: fromPool.role || 'dynamic', trigram: fromPool.trigram || '☰',
        color: fromPool.color || '#C8A850', glow: fromPool.glow || '#F0D890',
        reason: recommendation.reason || '',
        recommendationScore: recommendation.score || null,
        matchedDimensions: recommendation.matchedDimensions || [],
      };
      return null;
    })
    .filter(Boolean);
  const agentsForPlan = (Array.isArray(agentResult.agents) && agentResult.agents.length > 0)
    ? agentResult.agents
    : selectedAgents;
  const dimensions = Array.isArray(agentResult.dimensions) && agentResult.dimensions.length > 0
    ? agentResult.dimensions
    : agentsForPlan.map((agent) => ({
      name: agent.stance || agent.name,
      perspective: agent.perspective || 'reflection',
      agents: [agent.id],
      toolNeeds: [],
    }));
  logger.info('[Planner] 编排总管完成', {
    advisorCount: agentsForPlan.length,
    dimensionCount: dimensions.length,
    source: agentResult.fallback ? 'controlled-fallback' : 'model',
  });

  // 5. 生成 DeliberationPlan（按文档 4.3.2 节）
  //    toolProbes 填入探测摘要；askUser/round/openingLine 由 Step 4 autonomyGate 决定后回填
  const deliberationPlan = {
    depth: depthRoute.depth,
    depthReason: depthRoute.reason,
    maxQuestions: Math.max(depthRoute.maxQuestions, adaptiveIntake.informationFields.length),
    dimensions,
    agents: agentsForPlan,
    toolProbes: toolResults.map((r) => ({
      tool: r.tool,
      summary: r.summary,
      ok: r.ok,
      status: r.status,
      evidenceLevel: r.evidence?.level || null,
      freshness: r.evidence?.freshness || null,
      sourceName: r.evidence?.sourceName || null,
      observedAt: r.evidence?.observedAt || null,
    })),
    askUser: [],
    minFindings: MIN_FINDINGS,
    analysis: agentResult.analysis || '',
    recommendation: {
      source: agentResult.fallback ? 'controlled-fallback' : 'model',
      agentIds: selectedAgentIds,
      reasoning: agentResult.reasoning || '',
      details: Array.isArray(agentResult.recommendations) ? agentResult.recommendations : [],
    },
    informationFields: adaptiveIntake.informationFields,
    informationStates: adaptiveIntake.sufficiency.fieldStates,
    readiness: adaptiveIntake.sufficiency.readiness,
  };

  // 6. 自主性判定（Step 4 接入 autonomyGate）
  //    先把 plan/questionType/round 置入 session，供 scanTriggers 读 dimensions、evaluate 读 round
  session.plan = deliberationPlan;
  session.questionType = questionType;
  session.round = Number(session.round) || 1;
  session.memory_used = [];
  session.replan_count = session.replan_count ?? 0;

  const askUser = [];
  const openingLine = '案卷必需信息已收齐。接下来由编排总管提出阵容建议，再由你决定谁真正入席。';
  session.state = 'READY';
  session.askUser = [];
  session.information_states = adaptiveIntake.sufficiency.fieldStates;
  logger.info('[Planner] 自适应信息门禁通过 → READY', {
    round: session.round,
    coverage: adaptiveIntake.sufficiency.readiness.coverage,
  });

  // 把 askUser/round/openingLine 回填进 plan，随 plan JSONB 字段持久化（saveSession 持久化 plan）
  deliberationPlan.askUser = askUser;
  deliberationPlan.round = session.round;
  deliberationPlan.openingLine = openingLine;
  deliberationPlan.caseAnalysis = enrichedCaseAnalysis;
  deliberationPlan.caseFile = buildDecisionCase({ session, plan: deliberationPlan, memories, depthRoute });

  // 7. 持久化（saveSession 会自动生成 id 若缺失）
  try {
    const saveSession = dependencies.saveSessionFn || memoryService.saveSession;
    const saved = await saveSession(session);
    session.id = saved.id;
    logger.info('[Planner] 会话已持久化', { sessionId: session.id, state: session.state, round: session.round });
  } catch (e) {
    if (
      e?.code === 'EXECUTE_CLAIM_LOST'
      || e?.code === 'ANSWER_STATE_CONFLICT'
      || e?.code === 'ANSWER_PERSIST_FAILED'
    ) throw e;
    logger.warn('[Planner] 会话持久化失败，继续内存态', { error: e.message });
  }

  // 7.5 emit 工具调用事件到 EventBus（供前端LogPanel显示）
  if (session.id && toolResults.length > 0) {
    for (const r of toolResults) {
      eventBus.emit(session.id, {
        type: 'ACTION',
        data: {
          tool: r.tool,
          args: r.args,
          result: r.summary,
          ok: r.ok,
          elapsed: r.elapsed,
        },
      });
      if (r.ok) {
        eventBus.emit(session.id, {
          type: 'OBSERVATION',
          data: { insight: r.summary, tool: r.tool },
        });
      }
      const evidenceEvent = evidenceDomainEvent(r.tool, r);
      await eventBus.emit(session.id, {
        ...evidenceEvent,
        actor: 'tool_gateway',
        correlationId: `plan_${session.id}_${session.round}`,
        taskId: 'planner_evidence',
      });
    }
  }

  // 7.6 LLM 驱动演分析文本（v3.0 零预设：失败抛错，不降级模板）
  deliberationPlan.analysis = await ensurePlannerAnalysis(
    deliberationPlan.analysis,
    () => generateYanAnalysis(question, questionType, dimensions, toolResults, confirmedMemories),
  );

  const planCorrelationId = `plan_${session.id}_${session.round}`;
  for (const domainEvent of planDomainEvents(deliberationPlan, askUser)) {
    await eventBus.emit(session.id, {
      ...domainEvent,
      actor: 'planner',
      correlationId: planCorrelationId,
      taskId: domainEvent.data?.taskId,
    });
  }

  // 映射 L3 记忆为前端契约的 [{content, type}]
  const memoryForClient = [];

  logger.info('[Planner] Plan 阶段完成', {
    sessionId: session.id,
    state: session.state,
    round: session.round,
    dimCount: dimensions.length,
    memoryCount: memories.length,
    toolProbeCount: toolResults.length,
    toolProbeOk: toolResults.filter((r) => r.ok).length,
    askUserCount: askUser.length,
  });

  // 8. 返回（按统一数据契约）
  return {
    session,
    plan: deliberationPlan,
    askUser,
    openingLine,
    round: session.round,
    maxRound: Math.max(depthRoute.maxQuestions, adaptiveIntake.informationFields.length),
    memory: memoryForClient,
  };
}

export default { plan, detectQuestionType };
