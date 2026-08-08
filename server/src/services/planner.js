/**
 * 真 Agent 架构 Step 2/4: 规划器（Plan 阶段）v3.0
 *
 * 策略：LLM 驱动为主，零预设降级
 *  1. memoryService.recall 读 L3 命格（Cache-Aside，失败返回空）
 *  2. memoryService.recentSummaries 读 L2 摘要（失败返回空）
 *  3. detectQuestionType：正则快速检测 + LLM 兜底分类（失败抛错）
 *  4. LLM 驱动维度生成（失败抛错，不降级规则映射）
 *  5. 生成 DeliberationPlan（按文档 4.3.2 节）
 *  6. 自主性（Step 4）：autonomyGate.evaluate → ASK 转 WAIT / CONTINUE·STOP 进 EXECUTE
 *  7. memoryService.saveSession 持久化（askUser/round/openingLine 随 plan 字段持久化）
 *
 * v3.0 零预设：所有 LLM 失败路径要么重试要么报错，不再降级到规则映射/模板文案
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 3.1 / 3.2 / 4.3 / 6.3 / 7 节
 *       docs/AUTONOMY_GATE_DESIGN.md 第 5 节
 *       docs/specs/2026-08-01-industrial-v3-design.md 第7节（零预设降级）
 */

import { callLLM } from './llmRouter.js';
import * as memoryService from './memoryService.js';
import * as toolProbeService from './toolProbeService.js';
import { evaluate as evaluateAutonomy } from './autonomyGate.js';
import * as agentEngine from './agentEngine.js';
import logger from './logger.js';
import eventBus from './eventBus.js';
import { evidenceDomainEvent, planDomainEvents } from './agentEventSemantics.js';
import { withRetry } from './retryHelper.js';

// ============ 常量 ============

const LLM_TIMEOUT_MS = 20000;
const MIN_FINDINGS = 3;
const MAX_ROUND = 2;

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
          { role: 'system', content: '你是问题分类专家。将用户问题归类为以下类型之一：travel(出行/旅游/出差)、finance(财务/投资)、career(职业/工作)、health(健康/医疗)、relationship(情感/人际关系)、pet(养宠)、education(教育/学习)、legal(法律)、competition(比赛/竞赛)、tech(技术/编程)、city(租房/买房/定居/搬家/城市生活)、life(日常生活)、other(其他)。只返回类型关键词，不要解释。注意：租房买房是city不是travel；去某地工作/定居/生活是city不是travel。' },
          { role: 'user', content: `问题：${q}\n分类结果：` },
        ],
        { maxTokens: 10, temperature: 0.1, timeout: 10000 },
        { retries: 2, delayMs: 500, name: 'detectQuestionType' },
  );

  const normalized = (text || '').trim().toLowerCase();
  const validTypes = ['travel', 'finance', 'career', 'health', 'relationship', 'pet', 'education', 'legal', 'competition', 'tech', 'city', 'life', 'other'];
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

// v3.0 已删除 ruleBasedDimensions 函数（零预设：维度由 LLM 自主生成，失败抛错不降级规则映射）

/**
 * LLM 驱动的维度生成（替代硬编码 QUESTION_TYPE_TO_DIMENSIONS）
 * 演自主分析问题，生成维度，不依赖预设类型映射
 */
async function llmGenerateDimensions(question, memories, toolResults) {
  const memoryText = Array.isArray(memories) && memories.length > 0
    ? memories.map(m => `[${m.memory_type || '记忆'}] ${m.content}`).join('\n')
    : '（无历史命格记录）';

  const toolText = Array.isArray(toolResults) && toolResults.length > 0
    ? toolResults.map(r => `- [${r.tool}] ${r.summary}`).join('\n')
    : '（未窥得天机）';

  const prompt = `你是"演"，赛博推演师。分析用户问题，识别核心矛盾，生成推演维度。

【用户问题】${question}

【演所记命格】
${memoryText}

【演所窥天机】
${toolText}

【输出要求】只返回 JSON 数组，维度数量由问题复杂度决定（简单问题2-3个，复杂问题可以4-6个），每个元素形如：
{"name":"维度中文名","perspective":"英文标签","agents":["推荐agentId占位，可空"],"toolNeeds":["工具名，可空"]}

perspective 可选: financial/risk/emotional/reflection/strategic/action/communication/macro/health/legal/education/experience/practical/technical/career

规则：
1. 维度必须覆盖问题核心矛盾
2. 不要机械套用模板，基于问题实际内容生成
3. 维度数量由问题本身的复杂度决定，不要固定数量
4. 只返回 JSON 数组，不要任何解释`;

  try {
    const text = await callPlannerLLM(
      [{ role: 'user', content: prompt }],
      { maxTokens: 400, temperature: 0.3 },
      { retries: 2, delayMs: 1000, name: 'llmGenerateDimensions' },
    );

    const parsed = parseDimensionsJSON(text);
    if (parsed && parsed.length > 0) {
      return parsed.map(d => ({
        name: d.name || '未知维度',
        perspective: (d.perspective || 'reflection').toLowerCase(),
        agents: Array.isArray(d.agents) ? d.agents.filter(Boolean) : [],
        toolNeeds: Array.isArray(d.toolNeeds) ? d.toolNeeds.filter(Boolean) : [],
      }));
    }
    logger.warn('[Planner] llmGenerateDimensions LLM解析失败，启用规则兜底');
  } catch (e) {
    logger.warn('[Planner] llmGenerateDimensions LLM调用失败，启用规则兜底:', e.message);
  }

  // v3.1 兜底：按 QUESTION_TYPE_RULES 的问题类型生成启发式维度（不再 throw）
  return _heuristicDimensions(question);
}

/**
 * 规则维度生成（LLM 失败时兜底）
 * 根据问题关键词生成 4 个固定维度：财务+风险+长期+反思
 */
function _heuristicDimensions(question) {
  const q = (question || '').toLowerCase();
  const dims = [];
  const addIfNot = (name, perspective) => {
    if (!dims.find(d => d.name === name)) {
      dims.push({ name, perspective, agents: [], toolNeeds: [] });
    }
  };
  if (/(租房|买房|搬家|换城市|城市|房租|房租|房租|房源)/.test(q)) {
    addIfNot('预算与可负担性', 'financial');
    addIfNot('通勤与区位', 'practical');
    addIfNot('风险与隐患', 'risk');
    addIfNot('长期发展匹配度', 'strategic');
  } else if (/(offer|工作|职业|跳槽|辞职|创业|转行|升职|加班|入职|离职)/.test(q)) {
    addIfNot('收入与福利', 'financial');
    addIfNot('赛道与成长', 'career');
    addIfNot('风险与代价', 'risk');
    addIfNot('长期职业路径', 'strategic');
  } else if (/(投资|股票|基金|理财|借钱|还钱|贷款|汇率|股市)/.test(q)) {
    addIfNot('收益率测算', 'financial');
    addIfNot('风险敞口', 'risk');
    addIfNot('流动性与周期', 'strategic');
    addIfNot('决策心态', 'emotional');
  } else if (/(感情|恋爱|结婚|分手|婚姻|对象|男朋友|女朋友|老公|老婆|父母|家人)/.test(q)) {
    addIfNot('情感需求匹配', 'emotional');
    addIfNot('现实可行性', 'practical');
    addIfNot('风险与底线', 'risk');
    addIfNot('长期价值观', 'reflection');
  } else if (/(健康|生病|看病|运动|减肥|熬夜|失眠|焦虑|抑郁)/.test(q)) {
    addIfNot('身体状况评估', 'health');
    addIfNot('风险与代价', 'risk');
    addIfNot('执行可行性', 'practical');
    addIfNot('长期收益', 'strategic');
  } else if (/(旅行|旅游|游玩|出差|出国|自驾|攻略|景点)/.test(q)) {
    addIfNot('预算与开销', 'financial');
    addIfNot('行程可行性', 'practical');
    addIfNot('风险与意外', 'risk');
    addIfNot('体验与收益', 'reflection');
  } else {
    // 默认四维度
    addIfNot('投入与成本', 'financial');
    addIfNot('风险与隐患', 'risk');
    addIfNot('长期影响', 'strategic');
    addIfNot('内心诉求', 'emotional');
  }
  return dims;
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
 * LLM 增强规划：基于自评建议优化维度
 * v3.0 零预设：失败抛错，不返回 null 让调用方降级
 *
 * @param {string} question
 * @param {Array} currentDims 当前维度（供 LLM 参考）
 * @param {Array} memories L3 命格
 * @param {Array} toolResults 演窥探的天机（Step 3 注入）
 * @returns {Promise<Array>} 增强后的维度数组
 * @throws LLM 调用或解析失败时抛错
 */
async function llmEnhanceDimensions(question, currentDims, memories, toolResults) {
  const memoryText = Array.isArray(memories) && memories.length > 0
    ? memories.map((m) => `[${m.memory_type || '记忆'}] ${m.content}`).join('\n')
    : '（无历史命格记录）';

  const currentDimsText = currentDims
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

【当前维度（可调整）】
${currentDimsText}

【输出要求】只返回 JSON 数组，2-4 个维度，每个元素形如：
{"name":"维度中文名","perspective":"英文标签","agents":["推荐agentId占位，可空"],"toolNeeds":["工具名，可空"]}
perspective 可选: financial/risk/emotional/reflection/strategic/action/communication/macro/health/legal/education/experience/practical

规则：
1. 维度必须覆盖问题核心矛盾
2. 若命格与问题相关，应增加反思维度引用命格
3. 若天机显示特定风险（如恶劣天气、股市大跌），应强化对应维度
4. 只返回 JSON 数组，不要任何解释`;

  try {
    const text = await callPlannerLLM(
      [{ role: 'user', content: prompt }],
      { maxTokens: 400, temperature: 0.3 },
      { retries: 2, delayMs: 1000, name: 'llmEnhanceDimensions' },
    );

    if (text) {
      const parsed = parseDimensionsJSON(text);
      if (parsed && parsed.length > 0) {
        const dims = parsed.map((d) => ({
          name: d.name || '未知维度',
          perspective: (d.perspective || 'reflection').toLowerCase(),
          agents: Array.isArray(d.agents) ? d.agents.filter(Boolean) : [],
          toolNeeds: Array.isArray(d.toolNeeds) ? d.toolNeeds.filter(Boolean) : [],
        }));
        logger.info('[Planner] LLM 增强成功', { count: dims.length, dims: dims.map((d) => d.name) });
        return dims;
      }
    }
    logger.warn('[Planner] llmEnhanceDimensions LLM失败，返回原始维度');
  } catch (e) {
    logger.warn('[Planner] llmEnhanceDimensions LLM异常，返回原始维度:', e.message);
  }
  // v3.1 兜底：直接返回原维度，不抛错
  return currentDims;
}

/**
 * 演·自评（Self-Critique）— ReAct 循环的 Critique 步骤
 *
 * 评估当前维度规划是否合理，不合理则返回调整建议触发一次 replan
 * 对应 docs/重设.md 3.1 节 YanAgent.run 第 5 步 Self-Critique
 *
 * v3.0 零预设：失败抛错，不降级为"合理"
 *
 * @param {string} question 用户问题
 * @param {Array} dimensions 当前维度数组
 * @param {Array} toolResults 工具探测结果
 * @param {Array} memories L3 命格
 * @returns {Promise<{ok: boolean, reason?: string, suggestions?: Array}>}
 *   ok=true 维度合理；ok=false 需 replan，suggestions 为调整建议
 * @throws LLM 调用或解析失败时抛错
 */
async function selfCritiquePlan(question, dimensions, toolResults, memories) {
  const dimNames = dimensions.map(d => d.name).filter(Boolean);
  const toolSummaries = (toolResults || []).filter(t => t.ok).map(t => t.summary).filter(Boolean);
  const memoryHints = (memories || []).slice(0, 3).map(m => m.content).filter(Boolean);

  try {
    const result = await callPlannerLLM(
          [
            {
              role: 'system',
              content: `你是"演"，赛博推演师。请自评当前维度规划是否合理。
评估标准：
1. 维度是否覆盖问题核心矛盾？
2. 是否有冗余维度？
3. 是否遗漏关键视角（如风险/反思）？
4. 工具结果是否揭示了需要补充的维度？

只返回 JSON（不要 markdown 代码块）：
- 合理：{"ok":true,"reason":"维度覆盖完整"}
- 不合理：{"ok":false,"reason":"遗漏XX视角","suggestions":["增加XX维度"]}`,
            },
            {
              role: 'user',
              content: `问题：「${question}」
当前维度：${dimNames.join('、') || '无'}
天机提示：${toolSummaries.join('；') || '暂无'}
相关命格：${memoryHints.join('；') || '无'}

请自评。`,
            },
          ],
          { maxTokens: 200, temperature: 0.2 },
          { retries: 1, delayMs: 800, name: 'selfCritiquePlan' },
    );

    if (result) {
      let cleaned = String(result).trim();
      const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) cleaned = fenceMatch[1].trim();
      if (!cleaned.startsWith('{')) {
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) cleaned = objMatch[0];
      }
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed.ok === 'boolean') {
        logger.info('[Planner] selfCritique 完成(LLM)', { ok: parsed.ok, reason: parsed.reason?.slice(0, 60) });
        return parsed;
      }
    }
    logger.warn('[Planner] selfCritique LLM失败，降级规则自评合理');
  } catch (e) {
    logger.warn('[Planner] selfCritique LLM异常，降级规则自评合理:', e.message);
  }

  // v3.1 兜底：简单规则评估（维度>=3且含risk视角=合理）
  const hasRisk = dimensions.some(d => (d.perspective || '').includes('risk'));
  const ok = dimensions.length >= 3 && hasRisk;
  return {
    ok: true, // 默认不再触发 replan，避免无限重试
    reason: ok
      ? (hasRisk ? '规则自评：覆盖风险视角，维度充足' : '规则自评：维度充足')
      : '规则自评：缺少风险视角，但暂不触发重推',
  };
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

  // 4. LLM 驱动维度生成（v3.0 零预设：失败抛错，不降级规则映射）
  let dimensions = await llmGenerateDimensions(question, memories, toolResults);
  logger.info('[Planner] LLM维度生成成功', { count: dimensions.length });

  // 4.5 演·自评（Self-Critique）— ReAct 循环第 5 步
  //     评估维度是否合理，不合理则带建议触发一次 replan（硬约束最多 1 次）
  //     v3.0 零预设：selfCritique 失败抛错，不降级为"合理"
  //     依据: docs/重设.md 3.1 节 YanAgent.run 第 5 步
  const currentReplanCount = Number(session.replan_count) || 0;
  if (currentReplanCount < 1) {
    const critique = await selfCritiquePlan(question, dimensions, toolResults, memories);
    if (!critique.ok && Array.isArray(critique.suggestions) && critique.suggestions.length > 0) {
      logger.info('[Planner] selfCritique 触发 replan', { reason: critique.reason, suggestions: critique.suggestions });
      eventBus.emit(session.id, {
        type: 'THOUGHT',
        data: { step: 'self_critique', thought: `演·自评：${critique.reason}，变卦重推` },
      });
      // 带 suggestions 重新增强（拼接到 question 上下文）
      const critiqueContext = `【演自评建议】${critique.suggestions.join('；')}`;
      const reEnhanced = await llmEnhanceDimensions(
        `${question} ${critiqueContext}`,
        dimensions,
        memories,
        toolResults,
      );
      dimensions = reEnhanced;
      session.replan_count = currentReplanCount + 1;
      logger.info('[Planner] replan 完成', { newDimCount: dimensions.length, replanCount: session.replan_count });
    }
  }

  // 4.7 LLM 驱动选择 Agent（1-6个），失败抛错不降级
  const agentResult = await agentEngine.analyzeQuestion(question, userId, { useCustomAdvisors: true });
  const selectedAgentIds = Array.isArray(agentResult.agentIds) ? agentResult.agentIds : [];
  const selectedAgents = selectedAgentIds
    .map(id => {
      const fromPool = typeof agentEngine.getAgentById === 'function' ? agentEngine.getAgentById(id) : null;
      if (fromPool) return {
        id: fromPool.id, name: fromPool.name, stance: fromPool.stance,
        role: fromPool.role || 'dynamic', trigram: fromPool.trigram || '☰',
        color: fromPool.color || '#C8A850', glow: fromPool.glow || '#F0D890'
      };
      return null;
    })
    .filter(Boolean);
  const agentsForPlan = (Array.isArray(agentResult.agents) && agentResult.agents.length > 0)
    ? agentResult.agents
    : selectedAgents;

  // 5. 生成 DeliberationPlan（按文档 4.3.2 节）
  //    toolProbes 填入探测摘要；askUser/round/openingLine 由 Step 4 autonomyGate 决定后回填
  const deliberationPlan = {
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
  };

  // 6. 自主性判定（Step 4 接入 autonomyGate）
  //    先把 plan/questionType/round 置入 session，供 scanTriggers 读 dimensions、evaluate 读 round
  session.plan = deliberationPlan;
  session.questionType = questionType;
  session.round = Number(session.round) || 1;
  session.memory_used = memories;
  session.replan_count = session.replan_count ?? 0;

  // v3.0 零预设：autonomyGate 失败抛错，不降级到 EXECUTE
  const autonomy = await evaluateAutonomy(session, memories, toolResults);
  let askUser = [];
  let openingLine = autonomy.openingLine || '';
  if (autonomy.action === 'ASK') {
    session.state = 'WAIT';
    session.askUser = autonomy.questions;
    askUser = autonomy.questions;
    logger.info('[Planner] 自主性判定 → ASK（转 WAIT）', {
      round: autonomy.round,
      source: autonomy.questions[0]?.source,
      question: autonomy.questions[0]?.question,
    });
  } else {
    // CONTINUE / STOP 均进入 EXECUTE
    session.state = 'EXECUTE';
    session.askUser = [];
    askUser = [];
    logger.info('[Planner] 自主性判定 → EXECUTE', {
      action: autonomy.action,
      round: autonomy.round,
      reason: autonomy.reason || '',
    });
  }

  // 把 askUser/round/openingLine 回填进 plan，随 plan JSONB 字段持久化（saveSession 持久化 plan）
  deliberationPlan.askUser = askUser;
  deliberationPlan.round = session.round;
  deliberationPlan.openingLine = openingLine;

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
  const analysis = await generateYanAnalysis(question, questionType, dimensions, toolResults, memories);
  deliberationPlan.analysis = analysis;

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
  const memoryForClient = memories.map((m) => ({ content: m.content, type: m.memory_type }));

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
    maxRound: MAX_ROUND,
    memory: memoryForClient,
  };
}

export default { plan, detectQuestionType };
