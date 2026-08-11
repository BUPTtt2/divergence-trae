/**
 * Agent 编排引擎
 * - analyzeQuestion: 调用智谱 LLM 分析问题，根据问题复杂度自主决定需要哪些 Agent
 * - generateAgentDialogue: 调用 LLM 生成单个 Agent 的回应
 */

import { AGENT_POOL, AGENT_POOL_MAP, buildAgentSystemPrompt } from '../data/agentPool.js';
import { callLLM } from './llmRouter.js';
import { retrieveMemories, getUserProfile } from './memoryService.js';
import { listAdvisors, formatAdvisorForAgentPool } from './customAdvisorService.js';
import logger from './logger.js';

export function uniqueValidAgentIds(agentIds, validIds) {
  const allowed = new Set(Array.isArray(validIds) ? validIds : []);
  return [...new Set(Array.isArray(agentIds) ? agentIds : [])]
    .filter((id) => allowed.has(id));
}

const DIMENSION_PERSPECTIVES = new Set([
  'financial', 'risk', 'emotional', 'reflection', 'strategic', 'action',
  'communication', 'macro', 'health', 'legal', 'education', 'experience',
  'practical', 'technical', 'career',
]);

export function buildSelectionDimensions({
  selectedAgentIds = [],
  selectedAgents = [],
  modelDimensions = [],
} = {}) {
  const selectedIds = new Set(selectedAgentIds);
  const modelDefined = (Array.isArray(modelDimensions) ? modelDimensions : [])
    .slice(0, 6)
    .flatMap((dimension) => {
      const name = String(dimension?.name || '').trim().slice(0, 40);
      const perspective = String(dimension?.perspective || '').trim().toLowerCase();
      if (!name || !DIMENSION_PERSPECTIVES.has(perspective)) return [];
      return [{
        name,
        perspective,
        agents: (Array.isArray(dimension?.agentIds) ? dimension.agentIds : dimension?.agents || [])
          .filter((agentId) => selectedIds.has(agentId)),
        toolNeeds: (Array.isArray(dimension?.toolNeeds) ? dimension.toolNeeds : [])
          .map((tool) => String(tool || '').trim())
          .filter(Boolean)
          .slice(0, 4),
      }];
    });
  if (modelDefined.length >= 2) return modelDefined;

  return selectedAgents.slice(0, 6).map((agent) => ({
    name: String(agent.stance || agent.name || '补充视角').replace(/视角$/, '') || '补充视角',
    perspective: DIMENSION_PERSPECTIVES.has(agent.perspective) ? agent.perspective : 'reflection',
    agents: [agent.id],
    toolNeeds: [],
  }));
}

function buildRecommendationDetails({ agentIds = [], allAgentMap = {}, dimensions = [], modelRecommendations = [] } = {}) {
  const modelById = new Map((Array.isArray(modelRecommendations) ? modelRecommendations : [])
    .filter((item) => item?.agentId)
    .map((item) => [String(item.agentId), item]));
  return agentIds.map((agentId, index) => {
    const agent = allAgentMap[agentId] || {};
    const modelItem = modelById.get(agentId) || {};
    const matchedDimensions = dimensions
      .filter((dimension) => (dimension.agents || dimension.agentIds || []).includes(agentId))
      .map((dimension) => dimension.name)
      .filter(Boolean);
    return {
      agentId,
      score: Math.max(55, Math.min(98, Number(modelItem.score) || (92 - index * 7))),
      reason: String(modelItem.reason || `负责${matchedDimensions.join('、') || agent.stance || agent.name || '补充判断'}，与其他席位形成独立校验。`).slice(0, 160),
      matchedDimensions,
      source: 'model',
    };
  });
}

/**
 * 分析用户问题，选择最适合的 Agent（数量由问题复杂度决定）
 *
 * @param {string} question 用户问题
 * @returns {Promise<{agentIds: string[], reasoning: string, fallback?: boolean, analysis?: string}>}
 */
export async function analyzeQuestion(question, userId = null, options = {}) {
  if (!question || typeof question !== 'string') {
    throw Object.assign(new Error('analyzeQuestion 缺少有效的 question 参数'), { type: 'INVALID_ARGUMENT' });
  }

  const { useCustomAdvisors = false, customAdvisorIds = [] } = options;

  let customAgents = [];
  if (useCustomAdvisors && userId) {
    try {
      const userAdvisors = await listAdvisors(userId);
      if (customAdvisorIds && customAdvisorIds.length > 0) {
        customAgents = userAdvisors
          .filter(a => customAdvisorIds.includes(a.id))
          .map(formatAdvisorForAgentPool);
      } else {
        customAgents = userAdvisors.map(formatAdvisorForAgentPool);
      }
    } catch (e) {
      console.warn('[agent] 加载自定义顾问失败:', e.message);
    }
  }

  const allAgents = [...AGENT_POOL, ...customAgents];
  const allAgentMap = { ...AGENT_POOL_MAP };
  for (const ca of customAgents) {
    allAgentMap[ca.id] = ca;
  }

  const agentList = allAgents.map(
    (a) => `- id: ${a.id} | 名称: ${a.name} | 视角: ${a.stance} | 擅长: ${(a.questionTypes || []).join(', ')}${a.isCustom ? ' | [自定义顾问]' : ''}`
  ).join('\n');

  // 注入用户画像记忆
  let memoryContext = '';
  if (userId) {
    try {
      const profile = await getUserProfile(userId);
      const memories = await retrieveMemories(userId, question, 3);
      if (profile) {
        memoryContext += `\n【关于此用户的背景】\n${profile}\n`;
      }
      if (memories && memories.length > 0) {
        memoryContext += `\n【相关历史推演】\n${memories.map(m => `- ${m.content}`).join('\n')}\n`;
      }
    } catch (e) {
      console.warn('[agent] 记忆加载失败:', e.message);
    }
  }

  const systemPrompt = `你是"演"，推演核心，统领全局的太极Agent。
${memoryContext}
【任务】分析用户问题，根据问题的复杂度和涉及的维度，从以下Agent池中选择最适合的Agent团队。

可用Agent池：
${agentList}

【输出格式】JSON:
{
  "agentIds": ["id1", "id2", ...],
  "analysis": "对问题的深度分析和拆解，说明为什么需要这些视角",
  "reasoning": "挑选每个Agent的理由，每个Agent一句话",
  "dimensions": [{"name":"本题具体判断维度","perspective":"risk","agentIds":["id1"],"toolNeeds":[]}],
  "recommendations": [{"agentId":"id1","score":86,"reason":"该智囊具体命中了案卷里的哪一项目标、未知或约束"}]
}

【规则】
1. Agent 数量由问题复杂度决定：简单问题1-2个够用，复杂问题可以选3-8个，不要机械地选固定数量
2. 必须选择与问题最相关的Agent，覆盖不同视角（财务、风险、本心、长期、行动等）
3. 如果现有Agent池无法覆盖某个关键维度，可以在 analysis 中说明"建议生成X视角的临时智囊"
4. agentIds 必须是上面列出的有效 id
5. analysis 要深入拆解问题的核心矛盾和关键维度
6. reasoning 要说明每个被选中Agent的作用
7. dimensions 必须是 2-6 个贴合本题的判断维度，并绑定负责的已选 Agent；不要套固定模板
8. 只返回 JSON，不要其他文字`;

  const userPrompt = `用户问题：「${question}」

请分析这个问题的核心矛盾，选择最适合的Agent团队，并说明挑选理由。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 300, temperature: 0.3, timeout: 18000 }
    );

    if (!text) {
      throw Object.assign(new Error('analyzeQuestion LLM返回空文本'), { type: 'LLM_EMPTY_OUTPUT' });
    }

    // 提取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw Object.assign(new Error('analyzeQuestion LLM返回内容无有效JSON'), { type: 'LLM_INVALID_FORMAT', raw: text.slice(0, 200) });
    }

    const parsed = JSON.parse(match[0]);
    const validIds = allAgents.map((a) => a.id);
    const agentIds = uniqueValidAgentIds(parsed.agentIds, validIds);

    // LLM 未选出任何 Agent 或解析失败：启用规则兜底（风眼/镜渊/钱谷/路向 四核心 + 关键词扩展）
    if (agentIds.length === 0) {
      logger.warn('[agentEngine] analyzeQuestion LLM无有效Agent，启用规则兜底');
      const fallback = _ruleBasedAgents(question, allAgents);
      return fallback;
    }

    const dimensions = buildSelectionDimensions({
      selectedAgentIds: agentIds,
      selectedAgents: agentIds.map((id) => allAgentMap[id]).filter(Boolean),
      modelDimensions: parsed.dimensions,
    });
    return {
      agentIds,
      reasoning: parsed.reasoning || 'LLM 分析完成',
      analysis: parsed.analysis || '',
      dimensions,
      recommendations: buildRecommendationDetails({
        agentIds,
        allAgentMap,
        dimensions,
        modelRecommendations: parsed.recommendations,
      }),
      fallback: false,
    };
  } catch (e) {
    logger.warn('[agentEngine] analyzeQuestion 失败，启用规则兜底（非零预设）:', { error: e.message, type: e.type });
    // v3.1 兜底：不再 throw，按关键词返回默认组合 + 标记 fallback=true
    return _ruleBasedAgents(question, allAgents, e.message);
  }
}

/**
 * Agent 选择规则兜底（当 LLM 失败/超时/无输出时使用）
 * 核心四智囊（风眼/镜渊/钱谷/路向）+ 关键词扩展
 * @param {string} question
 * @param {Array} allAgents 可选 agent 池（含 custom）
 * @param {string} errorReason 可选：记录失败原因
 */
function _ruleBasedAgents(question, allAgents = [], errorReason = '') {
  const q = (question || '').toLowerCase();
  const core = ['fengyan', 'jingyuan', 'qiangu', 'luxiang'];
  const extra = [];
  // 情感类 → 加青衿
  if (/(感情|恋爱|结婚|分手|对象|老公|老婆|父母|家人|朋友|同事)/.test(q)) extra.push('qingjin');
  // 教育/成长类 → 加墨隐
  if (/(读书|考试|考研|留学|培训|学习|学校|技能|成长|毕业)/.test(q)) extra.push('moyin');
  // 健康类 → 加素问
  if (/(健康|身体|生病|看病|运动|减肥|健身|治病|养生|熬夜|失眠|焦虑|抑郁|体检|病|痛|伤)/.test(q)) extra.push('suwen');
  // 法律/合同类 → 加法镜
  if (/(合同|法律|官司|起诉|律师|权益|维权|合规|违法|版权|专利|纠纷)/.test(q)) extra.push('fajing');
  // 旅行/出行类 → 加云逰
  if (/(旅行|旅游|游玩|出差|出国|自驾|攻略|景点|回老家|返乡)/.test(q)) extra.push('yunyou');
  // 宠物类 → 加灵宠
  if (/(养猫|养狗|养宠物|宠物|猫|狗|鸟|鱼|兔|仓鼠)/.test(q)) extra.push('lingchong');
  // 投资类 → 加钱谷已在core里，再加朱雀偏决策
  if (/(投资|股票|基金|理财|贷款|汇率|通货膨胀|股市|定投)/.test(q)) extra.push('zhuque');

  // 去重并保证一定在 AGENT_POOL 里
  const allIds = new Set(allAgents.map(a => a.id));
  const pickedIds = [...core, ...extra].filter(id => allIds.has(id)).slice(0, 6);
  const pickedAgentIds = pickedIds.length >= 2 ? pickedIds : core.filter(id => allIds.has(id));
  const dimensions = buildSelectionDimensions({
    selectedAgentIds: pickedAgentIds,
    selectedAgents: pickedAgentIds.map((id) => allAgents.find((agent) => agent.id === id)).filter(Boolean),
  });
  const fallbackMap = Object.fromEntries(allAgents.map((agent) => [agent.id, agent]));
  return {
    agentIds: pickedAgentIds,
    reasoning: '规则兜底：核心四智囊 + 关键词扩展',
    analysis: errorReason ? `（LLM暂不可用：${errorReason.slice(0, 50)}，演已按规则选智囊）` : '（演按问题类型匹配智囊）',
    dimensions,
    recommendations: buildRecommendationDetails({
      agentIds: pickedAgentIds,
      allAgentMap: fallbackMap,
      dimensions,
    }).map((item) => ({ ...item, source: 'controlled-fallback' })),
    fallback: true,
  };
}

/**
 * 生成单个 Agent 的回应
 * 使用 agent.persona 作为 system prompt
 * 要求 1-3 句话，不超过 80 字，中文口语
 *
 * @param {object} agent Agent 对象（来自 agentPool）
 * @param {string} question 用户问题
 * @param {Array} previousDialogues 之前 Agent 的对话 [{ agentId, name, text }]
 * @param {Array} fullDialogueHistory 当前 Agent 与用户的完整对话历史（反问+回答） [{ speaker: 'agent'|'user', text }]
 * @param {string|null} userId 用户ID，用于检索跨推演记忆
 * @returns {Promise<string>} Agent 回应文本
 */
export function sanitizeAgentDialogue(rawText, question = '') {
  const normalizedQuestion = String(question || '').trim();
  return String(rawText || '')
    .replace(/<user_input\b[^>]*>[\s\S]*?<\/user_input>/gi, ' ')
    .replace(/<\/?mention\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== normalizedQuestion)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function generateAgentDialogue(agent, question, previousDialogues = [], fullDialogueHistory = [], userId = null, options = {}) {
  if (!agent || !question) {
    throw Object.assign(new Error('generateAgentDialogue 缺少 agent 或 question'), { type: 'INVALID_INPUT' });
  }

  // 从 previousDialogues 提取参与的智囊列表（用于 team_map）
  const teamAgentIds = new Set(previousDialogues.map(d => d.agentId).filter(Boolean));
  const teamAgents = Array.from(teamAgentIds).map(id => AGENT_POOL_MAP[id]).filter(Boolean);

  // 三层提示词
  const basePrompt = buildAgentSystemPrompt(agent, teamAgents);

  // ===== P6：注入相关记忆和用户画像（所有智囊都能看到，解决"其他Agent无权查看记忆"的问题）=====
  let memoryContextInjection = '';
  if (userId) {
    try {
      const [profileMem, relatedMemories] = await Promise.all([
        getUserProfile?.(userId).catch(() => ''),
        retrieveMemories?.(userId, `${question} ${agent.stance || agent.name}`, 3).catch(() => []),
      ]);

      if (profileMem && String(profileMem).trim()) {
        memoryContextInjection += `\n\n【用户画像背景（长期记忆汇总）】\n${String(profileMem).trim()}\n`;
      }
      if (Array.isArray(relatedMemories) && relatedMemories.length > 0) {
        memoryContextInjection += `\n【相关历史推演记忆（仅供参考，不要直接复述）】\n`;
        relatedMemories.forEach((m, i) => {
          memoryContextInjection += `${i + 1}. [${m.memory_type || '记忆'}] ${m.content}\n`;
        });
      }
    } catch (e) {
      // 注入失败不阻塞智囊发言
      console.warn('[agentEngine] 记忆注入失败跳过:', e.message);
    }
  }

  const findingInstruction = options.mode === 'finding' ? `

【本轮交付格式】
案卷已经由用户确认，本轮不要继续采访用户。你必须给出一项独立、可反驳的判断，并严格按五段输出：
【主张】一句明确但有条件的判断
【依据】只使用用户已确认信息、给定证据和明确推理，不虚构事实
【假设】用分号分隔尚未验证的前提；没有则写“无”
【反转条件】用分号分隔会使主张失效或需要改路的信号
【置信度】0%到100%，根据信息完整度与证据强度给出
不要输出上述五段以外的内容。` : '';

  const interactionRules = options.mode === 'finding' ? `
【案卷判断规则】
1. 案卷已由用户确认，不再向用户提问；缺失信息必须列为假设或反转条件。
2. 不得编造地点、价格、收入、概率、行情或用户背景。没有可追溯来源就明确写“未知”。
3. 主张必须有条件、可反驳；依据要完整解释为什么，不得只写一句口号。
4. 只履行自己的角色合同，不代替其他智囊，也不替用户做最终决定。` : `
【对话规则】
1. 先用一句话说明你基于案卷更倾向什么，再给出与用户已确认事实相连的理由；信息不足时只问 1 个最能改变判断的问题。
2. 语气冷静、协作、条件化，优先使用“如果…那么…”“我更倾向…”；禁止羞辱、命令式裁决和“否则就是失败/负资产”一类绝对化措辞。
3. 复述你真正理解到的现状，不能补写用户没说过的背景。
4. 数字必须来自用户或已接受证据；没有来源就写成待验证变量，禁止为了显得专业而编造比例、概率和成本。
5. 回答至少包含：当前倾向、两条理由、一个未知或反转条件、一个可逆下一步。`;

  const systemPrompt = `${basePrompt}${memoryContextInjection}${interactionRules}

【补充约束】
- 用清楚自然的中文，不写空泛口号
- 必须抓住用户问题里的具体词（数字、对象、场景），不要泛泛而谈
- 不要给"祝你顺利"之类的客套结尾
- 可以质疑用户、可以反问、可以泼冷水，但要说人话
- 只输出用户可直接阅读的正文，禁止输出 XML/HTML 标签、user_input、mention 或系统字段

【真Agent协作指令】
- 若前面有其他智囊发言，只在确实相关时明确同意、反驳或补充，不得为了表演协作而硬引用
- 若发现前一位智囊遗漏了关键维度，指出遗漏及其对结论的影响
- 不重复已有观点；新增信息必须能进入案卷${findingInstruction}`;

  // 构建上下文：之前的 Agent 发言（带 agentId 便于 LLM 精确引用）
  let contextText = '';
  if (previousDialogues.length > 0) {
    contextText = '\n\n【其他智囊的发言（你可引用、反驳、补充，不要重复）】\n' +
      previousDialogues
        .map((d) => {
          const name = d.name || AGENT_POOL_MAP[d.agentId]?.name || d.agentId || '未知';
          const stance = AGENT_POOL_MAP[d.agentId]?.stance || '';
          return `${name}（${d.agentId || 'unknown'}${stance ? ' · ' + stance : ''}）: ${d.text}`;
        })
        .join('\n');
  }

  // 如果有当前Agent的对话历史（反问+回答），注入到上下文
  let agentContextText = '';
  if (fullDialogueHistory.length > 0) {
    agentContextText = '\n\n【你与用户的对话历史】\n' +
      fullDialogueHistory
        .map(d => {
          if (typeof d === 'string') {
            if (d.startsWith('【你】')) return `用户: ${d.replace('【你】', '').trim()}`;
            return `你: ${d}`;
          }
          return `${d.speaker === 'agent' ? '你' : '用户'}: ${d.text}`;
        })
        .join('\n');
  }

  const evidenceContext = (Array.isArray(options.evidence) ? options.evidence : [])
    .filter((item) => item?.evidence?.accepted === true)
    .map((item, index) => `${index + 1}. [${item.tool || 'tool'}] ${item.evidence?.summary || item.summary || ''} 来源：${item.evidence?.sourceName || '未标注'}`)
    .filter((item) => item.trim())
    .join('\n');
  const evidenceText = evidenceContext
    ? `\n\n【本轮可引用的已接受工具证据】\n${evidenceContext}`
    : '\n\n【本轮工具证据】没有通过证据门禁的外部资料；不得声称已查到实时行情、价格或概率。';

  const userPrompt = `用户问：「${question}」${contextText}${agentContextText}${evidenceText}

请以 ${agent.name}（${agent.stance}）的身份，${options.mode === 'finding' ? `完成任务“${options.task || '给出独立判断'}”，并按指定四段格式提交 finding` : '说 1-3 句话回应。不要复述用户问题'}。`;

  // v3.0 零预设：LLM 失败抛错（由调用方 withRetry 处理）
  // P0-2 修复：放宽长度限制，给Agent提问+讨论空间（之前200太挤）
  const text = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: options.mode === 'finding' ? 800 : 450, temperature: options.mode === 'finding' ? 0.45 : 0.75, timeout: 16000 }
  );

  const sanitized = sanitizeAgentDialogue(text, question);
  if (!sanitized) {
    throw Object.assign(new Error(`智囊${agent.name}发言LLM返回空`), { type: 'LLM_EMPTY_OUTPUT' });
  }
  return sanitized.slice(0, options.mode === 'finding' ? 1200 : 500);
}

/**
 * Agent 反问用户 - 从自己的视角问一个能获取关键信息的问题
 *
 * @param {object} agent Agent 对象
 * @param {string} question 用户原始问题
 * @param {Array} dialogueHistory 对话历史 [{ speaker: 'agent|user', text: '...', agentId?: string }]
 * @returns {Promise<{question: string, needMoreInfo: boolean}>}
 */
export async function generateAgentQuestion(agent, question, dialogueHistory = []) {
  if (!agent || !question) {
    return { question: '你心里其实已经有答案了，对吗？', needMoreInfo: false };
  }

  // 三层提示词
  const basePrompt = buildAgentSystemPrompt(agent);

  const systemPrompt = `${basePrompt}

【任务】从你的专业视角出发，问用户一个具体、深入的问题，层层递进地挖掘关键信息。

【提问要求】
- 只问一个问题，不要说其他解释性文字，不要重复之前的问题
- 问题必须具体，针对用户的真实情况，不能笼统（例如：不要问"你怎么看"，要问具体数字、具体情况）
- 如果有对话历史，要基于历史内容递进，问更深层次的问题
- 问题要能帮助你做出更准确的判断
- 用中文口语，简短有力，直击要害`;

  let contextText = '';
  if (dialogueHistory.length > 0) {
    contextText = '\n\n【对话历史】\n' +
      dialogueHistory
        .map((d) => {
          if (typeof d === 'string') {
            if (d.startsWith('【你】')) return `用户: ${d.replace('【你】', '').trim()}`;
            return `${agent.name}: ${d}`;
          }
          const role = d.speaker === 'agent' ? `${AGENT_POOL_MAP[d.agentId]?.name || agent.name || '未知'}` : '用户';
          return `${role}: ${d.text}`;
        })
        .join('\n');
  }

  const userPrompt = `用户问题：「${question}」${contextText}

请以 ${agent.name}（${agent.stance}）的身份，问一个能获取关键信息的问题。`;

  // v3.0 零预设：LLM 失败抛错（由调用方 withRetry 处理）
  const text = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 100, temperature: 0.8, timeout: 8000 }
  );

  if (!text || !text.trim()) {
    throw Object.assign(new Error(`智囊${agent.name}生成追问问题LLM返回空`), { type: 'LLM_EMPTY_OUTPUT' });
  }
  return { question: text.trim().slice(0, 80), needMoreInfo: true };
}

/**
 * 判断 Agent 是否需要继续追问用户
 *
 * @param {object} agent Agent 对象
 * @param {string} originalQuestion 用户原始问题
 * @param {Array} dialogueHistory 对话历史
 * @param {string} lastUserAnswer 用户上一次回答
 * @returns {Promise<{continueAsking: boolean, nextQuestion?: string}>}
 */
export async function shouldContinueAsking(agent, originalQuestion, dialogueHistory = [], lastUserAnswer = '') {
  if (!agent || !originalQuestion) {
    return { continueAsking: false };
  }

  const systemPrompt = `你是${agent.name}（${agent.stance}），正在分析用户问题。

【任务】判断是否需要继续追问用户。

【判断标准】
- 如果用户的回答已经提供了足够的信息让你做出判断，返回 false
- 如果用户的回答含糊、回避、或信息不足，需要继续追问，返回 true
- 最多追问2次，第2次后必须返回 false

【关键规则】
- 仔细阅读【对话历史】，用户已经说过的信息（如薪资数字、岗位、时间等）绝对不能再问一遍
- 追问必须基于用户尚未提及的新维度，不能重复已答内容
- 如果用户已给出具体数字或明确回答，视为该维度已充分，转向其他未覆盖的维度`;

  let contextText = '';
  if (dialogueHistory.length > 0) {
    contextText = '\n\n【对话历史】\n' +
      dialogueHistory
        .map((d) => {
          // 前端传过来的是字符串：用户消息以「【你】」开头，演的追问不带前缀
          if (typeof d === 'string') {
            if (d.startsWith('【你】')) return `用户: ${d.replace('【你】', '').trim()}`;
            return `${agent.name}: ${d}`;
          }
          // 兼容对象格式
          const role = d.speaker === 'agent' ? `${AGENT_POOL_MAP[d.agentId]?.name || agent.name || '未知'}` : '用户';
          return `${role}: ${d.text}`;
        })
        .join('\n');
  }

  const userPrompt = `用户原始问题：「${originalQuestion}」${contextText}

用户最近回答：「${lastUserAnswer}」

请判断是否需要继续追问。返回JSON: {continueAsking: true/false, nextQuestion: '如果需要追问的问题'}

只返回JSON，不要其他文字。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 150, temperature: 0.3, timeout: 5000 }
    );

    if (text) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          continueAsking: parsed.continueAsking === true,
          nextQuestion: parsed.nextQuestion || '',
        };
      }
    }

    return { continueAsking: false };
  } catch (e) {
    console.warn(`[agentEngine] ${agent.id} 判断追问失败，默认不再追问:`, e.message);
    return { continueAsking: false };
  }
}

/**
 * 演（主控Agent）的全局总结 - 梳理所有Agent的对话，生成总结和选项
 *
 * @param {string} originalQuestion 用户原始问题
 * @param {Array} agentIds 参与的Agent ID列表
 * @param {object} dialogueHistory 完整对话历史 { agentId: Array<string> }
 * @returns {Promise<{summary: string, options: Array<{label: string, keyPoints: Array<string>, guaRecommendation?: string}>}>}
 */
export async function generateMasterSummary(originalQuestion, agentIds = [], dialogueHistory = {}, context = {}) {
  if (!originalQuestion) {
    return {
      summary: '问题已分析完毕。请跟随本心做出选择。',
      options: [],
    };
  }

  let dialogueText = '';
  for (const id of agentIds) {
    const history = dialogueHistory[id];
    // ★ 兼容前端两种传参格式：{agentId: string}（单段长文本）或 {agentId: [string]}（历史数组）
    let chunks = [];
    if (typeof history === 'string') {
      chunks = history.length > 0 ? [history] : [];
    } else if (Array.isArray(history)) {
      chunks = history.filter(Boolean).map(String);
    } else if (history) {
      chunks = [String(history)];
    }
    if (chunks.length > 0) {
      const name = context?.advisorNames?.[id] || AGENT_POOL_MAP[id]?.name || id;
      dialogueText += `\n【${name}】\n${chunks.join('\n')}\n`;
    }
  }

  const systemPrompt = `你是"演"，推演核心，统领全局的太极Agent。

【任务】把完整案卷与每位智囊的独立判断合成为可执行决策：
1. 全局总结按“已确认事实 → 每位智囊主张及依据 → 共识/分歧 → 未知与反转条件”展开。
2. 输出2至3条真正不同、可执行且可撤回的路径，不能只是推进/暂缓/维持的换皮。

【输出格式】JSON:
{
  "summary": "全局总结文本...",
  "options": [
    {
      "label": "选项名称（简短）",
      "keyPoints": ["关键点1", "关键点2", "关键点3"],
      "guaRecommendation": "推荐的卦象（如：乾、坤、离），可选"
    }
  ]
}

【规则】
- 不遗漏任何已发言智囊；自定义智囊与系统智囊同等对待
- summary 可以完整，但不重复，不得把假设写成事实
- 每个选项代表一个真实可行的决策方向
- keyPoints 必须包含行动、适用条件、停止或改路信号
- 实时价格、行情、政策等只有在证据列表含可核验来源时才能引用，否则明确写“待核验”
- guaRecommendation 要与选项的气质匹配（乾=进取，坤=守拙，离=光明，坎=险中求进等）
- 只返回JSON，不要其他文字`;

  const userPrompt = `用户原始问题：「${originalQuestion}」

【各Agent对话记录】
${dialogueText || '无详细对话记录'}

【案卷与工具证据】
${JSON.stringify({
    understanding: context?.understanding || '',
    confirmedFacts: context?.confirmedFacts || [],
    unknowns: context?.unknowns || [],
    evidence: context?.evidence || [],
  }).slice(0, 10000)}

请梳理全局信息，生成总结和选项。`;

  // v3.0：LLM 失败必须返回本地兜底（不能抛错）。
  // 原设计：任何异常直接 throw → 端点 500 → 前端本地降级。
  // 用户明确要求"真正可用为优先级，不要一直降级走完流程"。
  // 现在：超时从 10s 放宽到 35s（30s Edge Runtime 上限），且任何异常都返回结构化本地兜底，
  // 端点永远返回 200 + {summary, options}，前端不再触发 500 异常。
  let text = null;
  try {
    text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 1400, temperature: 0.45, timeout: 35000 }
    );
  } catch (e) {
    console.warn('[generateMasterSummary] LLM调用异常，返回本地兜底:', e.message);
    return buildLocalMasterSummary(originalQuestion, agentIds, dialogueHistory);
  }

  if (!text) {
    console.warn('[generateMasterSummary] LLM返回空，返回本地兜底');
    return buildLocalMasterSummary(originalQuestion, agentIds, dialogueHistory);
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.warn('[generateMasterSummary] LLM无有效JSON，返回本地兜底。原文:', text.slice(0, 150));
    return buildLocalMasterSummary(originalQuestion, agentIds, dialogueHistory);
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    console.warn('[generateMasterSummary] JSON解析失败，返回本地兜底:', e.message);
    return buildLocalMasterSummary(originalQuestion, agentIds, dialogueHistory);
  }
  const summary = (parsed.summary || '').trim();
  const options = Array.isArray(parsed.options) ? parsed.options : [];
  if (!summary || options.length === 0) {
    console.warn('[generateMasterSummary] 字段缺失，返回本地兜底');
    return buildLocalMasterSummary(originalQuestion, agentIds, dialogueHistory);
  }
  // 补齐每个 option 的 keyPoints / guaRecommendation 字段，避免前端 undefined
  const normalizedOptions = options.slice(0, 3).map(opt => ({
    label: opt.label || '择一而行',
    keyPoints: Array.isArray(opt.keyPoints) && opt.keyPoints.length > 0
      ? opt.keyPoints.slice(0, 3)
      : ['先完成最小验证', '明确适用条件', '出现反转信号即改路'],
    guaRecommendation: opt.guaRecommendation || '乾',
  }));
  return { summary, options: normalizedOptions };
}

/** 本地兜底：从 dialogueHistory 真实对话中抽取关键词生成结构化总结+3选项（绝不返回预设空模板） */
export function buildLocalMasterSummary(originalQuestion, agentIds = [], dialogueHistory = {}) {
  const snippets = [];
  for (const id of agentIds) {
    const history = dialogueHistory[id] || [];
    if (history.length > 0) {
      const name = AGENT_POOL_MAP[id]?.name || id;
      const firstChunk = String(history[0] || '').slice(0, 55);
      if (firstChunk.length > 10) snippets.push(`${name}：${firstChunk}`);
    }
  }
  const keywords = _extractKeywords([originalQuestion, ...snippets].join(' '), 6);
  const qSlice = String(originalQuestion || '').slice(0, 45);

  if (/吃饭|进食|加餐|嘴馋|饥饿/.test(originalQuestion)) {
    const confirmedFacts = String(originalQuestion || '')
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(line => line && !line.includes('用户已确认案卷') && !/要不要吃饭/.test(line));
    const factSummary = confirmedFacts.length > 0
      ? confirmedFacts.slice(0, 3).join('；')
      : '目前还没有足够的身体信号与进食情境';
    const summary = `按你确认的信息：${factSummary}。这不是单纯的“吃或不吃”，而是先区分身体饥饿、进食冲动与当前目标，再选择一个可逆动作；若出现明显不适，应优先照顾身体并寻求专业帮助。`;
    return {
      summary,
      options: [
        {
          label: '先不加餐 · 观察十分钟',
          keyPoints: ['喝水并离开食物刺激', '十分钟后重新评估饥饿感', '适合刚吃过且更像嘴馋时'],
          guaRecommendation: '艮',
        },
        {
          label: '确有饥饿 · 少量补充',
          keyPoints: ['选择一份有明确分量的食物', '避免边刷手机边继续吃', '吃后记录饱腹与睡眠感受'],
          guaRecommendation: '坤',
        },
        {
          label: '仍想进食 · 记录触发因素',
          keyPoints: ['标记情绪、环境或习惯触发', '不把一次选择等同于成败', '把记录带入下一次推演'],
          guaRecommendation: '巽',
        },
      ],
    };
  }

  let summary;
  if (snippets.length > 0) {
    summary = `关于「${qSlice}」，众智已交锋${agentIds.length}路：${snippets.slice(0, 3).join('；')}。当前分歧集中在${keywords.slice(0, 3).join('、')}，下一步应先验证最可能改变选择的事实。`;
  } else {
    summary = `关于「${qSlice}」，当前缺少可核验的智囊结论。先围绕${keywords.slice(0, 3).join('、')}做一个低成本验证，再根据新证据决定推进、保留或退出。`;
  }

  const makePoints = (tone) => [
    `从${tone}角度拆解${keywords[0] || '利弊'}`,
    `审视${keywords[1] || '风险'}与长远影响`,
    `锚定${keywords[2] || '本心'}后迅速行动`,
  ];

  const options = [
    { label: '验证 · 小步试行', keyPoints: makePoints('试行'), guaRecommendation: '乾' },
    { label: '保留 · 补齐证据', keyPoints: makePoints('稳健'), guaRecommendation: '坤' },
    { label: '退出 · 设置止损', keyPoints: makePoints('止损'), guaRecommendation: '艮' },
  ];
  return { summary, options };
}

/** 从文本抽取最高频的中文词（简易分词版）*/
function _extractKeywords(text, n = 5) {
  const clean = String(text || '').replace(/[\s，。、！？：；""''（）《》【】0-9A-Za-z]/g, '');
  const freq = new Map();
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i + len <= clean.length; i++) {
      const w = clean.slice(i, i + len);
      if (/^[\u4e00-\u9fa5]+$/.test(w)) freq.set(w, (freq.get(w) || 0) + (5 - len));
    }
  }
  const out = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]);
  if (out.length === 0) return ['本心', '时势', '取舍', '因果', '机缘'].slice(0, n);
  while (out.length < n) out.push(['顺势', '守正', '通变', '慎独'][out.length % 4]);
  return out;
}

export function getAgentById(id) {
  return AGENT_POOL.find(a => a.id === id) || AGENT_POOL_MAP[id] || null;
}

export default {
  analyzeQuestion,
  generateAgentDialogue,
  generateAgentQuestion,
  shouldContinueAsking,
  generateMasterSummary,
  getAgentById,
};
