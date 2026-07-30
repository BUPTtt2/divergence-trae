/**
 * 真 Agent 架构 Step 2: 规划器（Plan 阶段）
 *
 * 策略：规则降级为主 + LLM 增强为辅
 *  1. memoryService.recall 读 L3 命格
 *  2. memoryService.recentSummaries 读 L2 摘要
 *  3. 规则降级规划：detectQuestionType → QUESTION_TYPE_TO_DIMENSIONS
 *  4. LLM 增强：callLLM 优化维度（8s 超时，失败走规则降级结果，不阻塞）
 *  5. 生成 DeliberationPlan（按文档 4.3.2 节）
 *  6. 自主性：Step 2 固定返回 CONTINUE（不追问，直接进 EXECUTE），ASK 逻辑留 Step 4
 *  7. memoryService.saveSession 持久化
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 3.1 / 3.2 / 4.3 / 6.3 / 7 节
 */

import { callLLM } from './llmRouter.js';
import * as memoryService from './memoryService.js';
import * as toolProbeService from './toolProbeService.js';
import logger from './logger.js';

// ============ 常量 ============

const LLM_TIMEOUT_MS = 8000;
const MIN_FINDINGS = 3;

/**
 * 问题类型 → 推演维度映射
 * 每种类型映射 2-4 个维度（perspective + 推荐 agentId 占位 + 工具需求）
 * perspective 标签对齐 agentRouter.js 的可选标签，便于后续匹配智囊
 */
const QUESTION_TYPE_TO_DIMENSIONS = {
  travel: [
    { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: ['web_search'] },
    { name: '健康维度', perspective: 'health', agents: [], toolNeeds: ['medical_query'] },
    { name: '体验维度', perspective: 'experience', agents: [], toolNeeds: ['route_query'] },
    { name: '反思维度', perspective: 'reflection', agents: ['jingyuan'], toolNeeds: [] },
  ],
  finance: [
    { name: '财务维度', perspective: 'financial', agents: ['qiangu'], toolNeeds: ['stock_query'] },
    { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: [] },
    { name: '战略维度', perspective: 'strategic', agents: [], toolNeeds: [] },
  ],
  career: [
    { name: '战略维度', perspective: 'strategic', agents: [], toolNeeds: [] },
    { name: '财务维度', perspective: 'financial', agents: ['qiangu'], toolNeeds: [] },
    { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: ['company_info'] },
    { name: '反思维度', perspective: 'reflection', agents: ['jingyuan'], toolNeeds: [] },
  ],
  health: [
    { name: '健康维度', perspective: 'health', agents: [], toolNeeds: ['medical_query'] },
    { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: [] },
    { name: '情感维度', perspective: 'emotional', agents: [], toolNeeds: [] },
  ],
  relationship: [
    { name: '情感维度', perspective: 'emotional', agents: [], toolNeeds: [] },
    { name: '沟通维度', perspective: 'communication', agents: [], toolNeeds: [] },
    { name: '反思维度', perspective: 'reflection', agents: ['jingyuan'], toolNeeds: [] },
  ],
  life: [
    { name: '反思维度', perspective: 'reflection', agents: ['jingyuan'], toolNeeds: [] },
    { name: '风险维度', perspective: 'risk', agents: ['fengyan'], toolNeeds: [] },
    { name: '实践维度', perspective: 'practical', agents: [], toolNeeds: [] },
  ],
};

/**
 * 问题类型关键词规则（按优先级匹配，首个命中即返回）
 * 独立实现，不依赖 agentRouter
 */
const QUESTION_TYPE_RULES = [
  { type: 'travel', pattern: /旅行|旅游|游玩|出差|出发|去西藏|去云南|去北京|去日本|去欧洲|出国|自驾|背包|攻略|景点|游记/ },
  { type: 'finance', pattern: /投资|股票|基金|理财|买房|贷款|借钱|还钱|财务|赚钱|存钱|汇率|通货膨胀|股市|基金定投/ },
  { type: 'career', pattern: /工作|职业|offer|跳槽|涨薪|创业|辞职|辞职|转行|升职|面试|简历|打工|内卷|加班/ },
  { type: 'health', pattern: /健康|身体|生病|看病|运动|减肥|健身|治病|养生|熬夜|失眠|焦虑|抑郁|体检/ },
  { type: 'relationship', pattern: /感情|恋爱|结婚|分手|婚姻|对象|男朋友|女朋友|老公|老婆|父母|家人|朋友|同事关系/ },
];

// ============ 工具函数 ============

/**
 * 简易关键词分类：travel/finance/career/health/relationship/life
 * @param {string} question
 * @returns {string} 问题类型
 */
export function detectQuestionType(question) {
  const q = (question || '').toLowerCase();
  if (!q) return 'life';
  for (const rule of QUESTION_TYPE_RULES) {
    if (rule.pattern.test(q)) return rule.type;
  }
  return 'life';
}

/**
 * 规则降级规划：根据问题类型返回维度列表
 * @param {string} question
 * @returns {Array} 维度数组（深拷贝，避免污染常量）
 */
function ruleBasedDimensions(question) {
  const type = detectQuestionType(question);
  const dims = QUESTION_TYPE_TO_DIMENSIONS[type] || QUESTION_TYPE_TO_DIMENSIONS.life;
  return dims.map((d) => ({ ...d, agents: [...d.agents], toolNeeds: [...d.toolNeeds] }));
}

/**
 * 解析 LLM 返回的维度 JSON 数组（容错）
 */
function parseDimensionsJSON(text) {
  if (!text) return null;
  const tryArr = (s) => {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* ignore */
    }
    return null;
  };
  const direct = tryArr(text);
  if (direct) return direct;
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    const extracted = tryArr(m[0]);
    if (extracted) return extracted;
  }
  return null;
}

/**
 * LLM 增强规划：优化/补充维度（8s 超时，失败走规则降级结果）
 * 返回 null 表示增强失败，调用方使用 ruleBased 结果
 *
 * @param {string} question
 * @param {Array} ruleDims 规则降级维度（兜底）
 * @param {Array} memories L3 命格
 * @param {Array} toolResults 演窥探的天机（Step 3 注入）
 * @returns {Promise<Array|null>} 增强后的维度数组
 */
async function llmEnhanceDimensions(question, ruleDims, memories, toolResults) {
  const memoryText = Array.isArray(memories) && memories.length > 0
    ? memories.map((m) => `[${m.memory_type || '记忆'}] ${m.content}`).join('\n')
    : '（无历史命格记录）';

  const ruleDimsText = ruleDims
    .map((d) => `- ${d.name}(perspective=${d.perspective})`)
    .join('\n');

  // Step 3: 注入演窥探的天机摘要（让 LLM 基于实时数据优化维度）
  const toolResultsText = Array.isArray(toolResults) && toolResults.length > 0
    ? toolResults.map((r) => `- [${r.tool}] ${r.summary}`).join('\n')
    : '（未窥得天机）';

  const prompt = `你是"演"，赛博推演师。请基于用户问题、已知命格与所窥天机，优化推演维度。

【用户问题】${question}

【演所记命格】
${memoryText}

【演所窥天机（实时数据，可据此调整维度侧重）】
${toolResultsText}

【规则降级已生成的维度（兜底，可调整）】
${ruleDimsText}

【输出要求】只返回 JSON 数组，2-4 个维度，每个元素形如：
{"name":"维度中文名","perspective":"英文标签","agents":["推荐agentId占位，可空"],"toolNeeds":["工具名，可空"]}
perspective 可选: financial/risk/emotional/reflection/strategic/action/communication/macro/health/legal/education/experience/practical

规则：
1. 维度必须覆盖问题核心矛盾
2. 若命格与问题相关，应增加反思维度引用命格
3. 若天机显示特定风险（如恶劣天气、股市大跌），应强化对应维度
4. 只返回 JSON 数组，不要任何解释`;

  try {
    const text = await callLLM(
      [{ role: 'user', content: prompt }],
      { maxTokens: 400, temperature: 0.3, timeout: LLM_TIMEOUT_MS },
    );
    if (!text) {
      logger.warn('[Planner] LLM 增强返回空，使用规则降级维度');
      return null;
    }
    const parsed = parseDimensionsJSON(text);
    if (!parsed || parsed.length === 0) {
      logger.warn('[Planner] LLM 增强 JSON 解析失败，使用规则降级维度', {
        textPreview: text.slice(0, 120),
      });
      return null;
    }
    // 清理/归一化
    const dims = parsed.map((d) => ({
      name: d.name || '未知维度',
      perspective: (d.perspective || 'reflection').toLowerCase(),
      agents: Array.isArray(d.agents) ? d.agents.filter(Boolean) : [],
      toolNeeds: Array.isArray(d.toolNeeds) ? d.toolNeeds.filter(Boolean) : [],
    }));
    logger.info('[Planner] LLM 增强成功', { count: dims.length, dims: dims.map((d) => d.name) });
    return dims;
  } catch (e) {
    logger.warn('[Planner] LLM 增强异常，使用规则降级维度', { error: e.message });
    return null;
  }
}

// ============ 主入口 ============

/**
 * Plan 阶段主入口
 * @param {object} session { id?, user_id, question, state }
 * @returns {Promise<{session, plan, askUser}>} session 已带 id，plan 为 DeliberationPlan，askUser 为空数组（Step 2 不追问）
 */
export async function plan(session) {
  const userId = session.user_id;
  const question = session.question || '';
  logger.info('[Planner] Plan 阶段开始', { sessionId: session.id, userId, question: question.slice(0, 60) });

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

  // 3. 规则降级规划
  const ruleDims = ruleBasedDimensions(question);
  const questionType = detectQuestionType(question);
  logger.info('[Planner] 规则降级规划完成', { questionType, dimCount: ruleDims.length });

  // 3.5 调工具窥天机（Step 3 接入：detectToolNeeds → probe）
  //     失败不阻塞规划，已有 try/catch 降级；结果注入 session 供 LLM/智囊/Reflect 使用
  let toolResults = [];
  try {
    const toolNeeds = toolProbeService.detectToolNeeds(session.question, questionType);
    toolResults = toolNeeds.length > 0
      ? await toolProbeService.probe(session.question, questionType)
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

  // 4. LLM 增强（失败走规则降级，不阻塞）—— 注入工具结果摘要让 LLM 基于天机优化维度
  const enhanced = await llmEnhanceDimensions(question, ruleDims, memories, toolResults);
  const dimensions = enhanced || ruleDims;

  // 5. 生成 DeliberationPlan（按文档 4.3.2 节）
  //    Step 3: toolProbes 填入探测摘要（Step 2 留空，Step 3 接工具）
  //    Step 2 不追问（askUser 留空，Step 4 实现）
  const deliberationPlan = {
    dimensions,
    toolProbes: toolResults.map((r) => ({ tool: r.tool, summary: r.summary, ok: r.ok })),
    askUser: [],
    minFindings: MIN_FINDINGS,
  };

  // 6. 自主性判定：Step 2 固定 CONTINUE，直接进 EXECUTE（ASK 逻辑留 Step 4）
  session.plan = deliberationPlan;
  session.state = 'EXECUTE';
  session.memory_used = memories;
  session.replan_count = session.replan_count ?? 0;

  // 7. 持久化（saveSession 会自动生成 id 若缺失）
  try {
    const saved = await memoryService.saveSession(session);
    session.id = saved.id;
    logger.info('[Planner] 会话已持久化', { sessionId: session.id, state: session.state });
  } catch (e) {
    logger.warn('[Planner] 会话持久化失败，继续内存态', { error: e.message });
  }

  logger.info('[Planner] Plan 阶段完成', {
    sessionId: session.id,
    state: session.state,
    dimCount: dimensions.length,
    memoryCount: memories.length,
    toolProbeCount: toolResults.length,
    toolProbeOk: toolResults.filter((r) => r.ok).length,
  });

  // 8. 返回（askUser 固定空数组）
  return { session, plan: deliberationPlan, askUser: [] };
}

export default { plan, detectQuestionType };
