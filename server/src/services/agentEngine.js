/**
 * Agent 编排引擎
 * - analyzeQuestion: 调用智谱 LLM 分析问题，返回需要哪些 Agent（1-6个）
 * - generateAgentDialogue: 调用 LLM 生成单个 Agent 的回应
 *
 * LLM 失败时降级到关键词匹配
 */

import { AGENT_POOL, getAgentsByIds, AGENT_POOL_MAP, buildAgentSystemPrompt } from '../data/agentPool.js';
import { callLLM } from './llmRouter.js';
import { retrieveMemories, getUserProfile, extractMemoriesFromInference } from './memoryService.js';
import { listAdvisors, formatAdvisorForAgentPool } from './customAdvisorService.js';

/**
 * 关键词 → 问题类型映射（降级用，复用前端 detectQuestionType 逻辑）
 */
const TYPE_KEYWORDS = {
  career: ['工作', '职业', 'offer', '跳槽', '转行', '升职', '离职', '辞职', '入职', '岗位', '职场'],
  finance: ['钱', '投资', '理财', '股票', '基金', '买房', '贷款', '消费', '预算', '薪', '工资', '存款'],
  relationship: ['恋爱', '分手', '结婚', '离婚', '表白', '暗恋', '感情', '对象', '男友', '女友', '喜欢', '爱'],
  life: ['人生', '未来', '方向', '意义', '迷茫', '焦虑', '压力', '选择', '纠结', '不知'],
  action: ['做不做', '要不要', '该不该', '能不能', '开始', '放弃', '坚持', '动手', '行动'],
  communication: ['沟通', '谈判', '吵架', '冲突', '说服', '表达', '对话', '说'],
  offer: ['涨薪', '薪资', '薪水', '包', 'package', '股权', '期权', '签约费', '入职', '团队变动', '高管'],
  startup: ['创业', '开公司', 'all in', '融', '种子轮', '天使', '合伙', '辞职创业', '离开大厂', '做 ai', '做产品'],
  invest: ['梭哈', '全仓', '抄底', '加仓', '止盈', '止损', 'etf', 'btc', '币', '加密'],
  city: ['北京', '上海', '深圳', '杭州', '广州', '成都', '搬迁', '去深圳', '去上海', '回二线', '回老家', '出国', '香港'],
  legal: ['合同', '协议', '法律', '起诉', '违约', '侵权', '知识产权', '竞业', '保密', '仲裁'],
  health: ['身体', '健康', '生病', '熬夜', '睡眠', '焦虑', '抑郁', '体检', '看病'],
  education: ['考研', '读研', '留学', '考公', '证书', '学习', '培训', '进修', '博士', '导师'],
  technical: ['技术', '架构', '代码', '开发', '系统', '实现', '工程', '方案', '选型'],
  product: ['产品', '需求', '用户', '功能', '设计', '原型', '迭代'],
};

/**
 * 降级：关键词匹配问题类型
 */
function detectQuestionType(question) {
  if (!question) return 'life';
  const lowerQ = question.toLowerCase();
  let bestType = 'life';
  let bestScore = 0;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerQ.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

/**
 * 降级：根据问题类型匹配 Agent
 * 最少 1 个（默认 jingyuan），最多 6 个
 */
function fallbackSelectAgents(question) {
  const type = detectQuestionType(question);
  const matched = AGENT_POOL.filter(
    (a) => Array.isArray(a.questionTypes) && a.questionTypes.includes(type)
  );

  // 确保 jingyuan（镜渊）始终在内
  const ids = new Set(['jingyuan']);
  for (const a of matched) {
    if (ids.size >= 6) break;
    ids.add(a.id);
  }

  const agentIds = Array.from(ids).slice(0, 6);
  return {
    agentIds,
    reasoning: `（关键词降级）检测到问题类型「${type}」，匹配 ${agentIds.length} 个 Agent`,
    fallback: true,
  };
}

/**
 * 分析用户问题，选择最适合的 Agent（1-6个）
 * 调用智谱 LLM 分析，失败时降级到关键词匹配
 *
 * @param {string} question 用户问题
 * @returns {Promise<{agentIds: string[], reasoning: string, fallback?: boolean, analysis?: string}>}
 */
export async function analyzeQuestion(question, userId = null, options = {}) {
  if (!question || typeof question !== 'string') {
    return fallbackSelectAgents(question || '');
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
【任务】分析用户问题，从以下Agent池中选择1-6个最适合的Agent。

可用Agent池：
${agentList}

【输出格式】JSON:
{
  "agentIds": ["id1", "id2", ...],
  "analysis": "对问题的深度分析和拆解，说明为什么需要这些视角",
  "reasoning": "挑选每个Agent的理由，每个Agent一句话"
}

【规则】
1. 最少选1个，最多选6个
2. 必须选择与问题最相关的Agent，覆盖不同视角（财务、风险、本心、长期、行动等）
3. 如果没有明确匹配，默认选 jingyuan（镜渊）
4. agentIds 必须是上面列出的有效 id
5. analysis 要深入拆解问题的核心矛盾和关键维度
6. reasoning 要说明每个被选中Agent的作用
7. 只返回 JSON，不要其他文字`;

  const userPrompt = `用户问题：「${question}」

请分析这个问题的核心矛盾，选择最适合的Agent团队，并说明挑选理由。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 300, temperature: 0.3, timeout: 8000 }
    );

    if (!text) {
      return fallbackSelectAgents(question);
    }

    // 提取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallbackSelectAgents(question);
    }

    const parsed = JSON.parse(match[0]);
    let agentIds = Array.isArray(parsed.agentIds) ? parsed.agentIds : [];

    // 验证 id 有效性
    const validIds = allAgents.map((a) => a.id);
    agentIds = agentIds.filter((id) => validIds.includes(id));

    // 硬限制：最少 1 个，最多 6 个
    if (agentIds.length === 0) {
      agentIds = ['jingyuan'];
    }
    if (agentIds.length > 6) {
      agentIds = agentIds.slice(0, 6);
    }

    return {
      agentIds,
      reasoning: parsed.reasoning || 'LLM 分析完成',
      analysis: parsed.analysis || '',
      fallback: false,
    };
  } catch (e) {
    console.warn('[agentEngine] analyzeQuestion LLM 失败，降级到关键词匹配:', e.message);
    return fallbackSelectAgents(question);
  }
}

/**
 * 本地预设回应（降级用）- 每个 Agent 有独特的预设
 */
const AGENT_PRESETS = {
  qiangu: [
    '先别急着表态。数字要拆开看：base、bonus、equity 各占几成？隐性收益算过吗？3年累计差值，才是真账。',
    '这笔账划不划算，要看现金流和机会成本。你算过放弃现有工作的代价吗？',
    '先列三个数字：总可投资金、占比、最大可承受亏损。数字不清之前，都是赌博。',
    '别只看明面的涨幅，隐性成本（社保基数、年终、调薪周期）才是真正决定差距的地方。',
  ],
  luxiang: [
    '薪资只是入场券，关键是赛道。3年后回看，哪个选择能让你简历上多一个有分量的章节？',
    '站在五年后的时间点回望，这条路是向上还是向下？你的能力护城河够不够宽？',
    '把当下选择放回3-10年尺度，追问：你想成为什么样的人？',
    '行业周期、个人能力护城河、赛道天花板——这三个维度，哪个最让你担心？',
  ],
  fengyan: [
    '慢着，先泼盆冷水。最坏情况是什么？你能承受吗？如果不能，你需要更多信息，不是更多分析。',
    '你看到的是机会，还是被忽略的致命假设？我见过太多看起来光鲜的选择，背后是烂摊子。',
    '乐观是最大的风险。先问：如果错了，你怎么办？',
    '别急，先列反面证据。什么信号出现，你会承认自己选错了？',
  ],
  xinhe: [
    '在开始分析之前，我想先问你：你现在每天早上醒来想到上班，内心是什么感受？身体的反应经常是答案。',
    '你描述这件事时，身体是放松还是紧绷？最近一次让你真正开心是什么时候？',
    '不要回答"应该"，回答"愿意"。如果没人看着，你会怎么选？',
    '把被忽略的情绪说出来。你真正害怕的，是选错，还是后悔没选？',
  ],
  jingyuan: [
    '你问"该不该"，这个"该"是谁的标准？停下来，回到你自己。',
    '上次类似的情况，你选了X，后来呢？人最大的盲区不是信息不足，而是不肯承认自己在重复。',
    '你心里其实已经有答案了，只是在等一个确认。我换个问法：你敢不敢对三个月后的自己说"我选了X"？',
    '你问这个问题的方式，已经暴露了你的倾向。把问题翻转过来，问自己真正想问的。',
  ],
  yuntu: [
    '把这件事放进大时代看。现在是周期的哪个位置？这艘船正在涨潮还是退潮？',
    '行业Beta是上还是下？你是吃Beta红利，还是做Alpha？这需要的能力完全不同。',
    '看政策、看行业聚集度、看生活成本曲线。这是10年题，不是3年题。',
    '宏观环境在变化，你的选择要跟着周期走。逆势者事倍功半。',
  ],
  zhenxing: [
    '想太多就是不做。第一刀切在哪里？今晚能做什么？',
    '七成把握就该出手，剩下的两成在路上补。再等一周，你会更清楚还是更焦虑？',
    '设一个deadline，逼自己"做"而不是"想"。分析够了，该出手时就出手。',
    '不要等完美方案。先动起来，边走边调整。不动手的话，你在等什么？',
  ],
  duiyan: [
    '你真的和对方谈过你的这些纠结吗？很多人是"我以为他知道"，但其实对方一无所知。',
    '把"要不要"翻译成"怎么谈"。对方真正在意的是什么？你表达的是诉求还是情绪？',
    '一次真诚的对话，能解决80%的结。别自己在心里演独角戏。',
    '这话该对谁说、怎么说、在什么时机说？沟通的艺术在于精准，不是多言。',
  ],
  falv: [
    '先问：这件事有没有落进合同里？白纸黑字胜过一切口头承诺。',
    '权责边界、违约后果、退出机制——这三件事清楚了吗？',
    '如果翻脸，你手里有什么牌？不要等到出问题才想起法律。',
    '每一步都要留好证据。你现在的操作，在法律上等于什么？',
  ],
  jiankang: [
    '这个选择会让你睡得着吗？三年后你的身体扛得住吗？',
    '所有决策最终都要由身体承担。你在透支式奋斗吗？',
    '睡眠、饮食、运动、情绪负荷——哪个已经亮起红灯？',
    '拼搏不等于透支。停下来，听听身体的声音。',
  ],
  jiaoyu: [
    '看决策不只看结果，更看这个选择能不能让你长出新能力。',
    '十年后回看，这个选择教会你什么？你会变成什么样的人？',
    '学习曲线、能力迁移、认知升级——哪个是你最需要的？',
    '授人以渔胜过授人以鱼。选那条更能磨砺心智的路。',
  ],
  jishu: [
    '这事在工程上能不能落地？第一版最小可用是什么样？',
    '再好的战略，执行不到位也是零。可行性、技术债务、架构权衡——哪个最让你担心？',
    '不要追求完美，但要求每个选择都经得起"怎么做"的追问。',
    '把模糊的纠结拆成可执行的第一步。你今天能写的第一行代码是什么？',
  ],
};

/**
 * 生成单个 Agent 的回应
 * 使用 agent.persona 作为 system prompt
 * 要求 1-3 句话，不超过 80 字，中文口语
 * 8s 超时降级到本地预设
 *
 * @param {object} agent Agent 对象（来自 agentPool）
 * @param {string} question 用户问题
 * @param {Array} previousDialogues 之前 Agent 的对话 [{ agentId, name, text }]
 * @param {Array} fullDialogueHistory 当前 Agent 与用户的完整对话历史（反问+回答） [{ speaker: 'agent'|'user', text }]
 * @param {string|null} userId 用户ID，用于检索跨推演记忆
 * @returns {Promise<string>} Agent 回应文本
 */
export async function generateAgentDialogue(agent, question, previousDialogues = [], fullDialogueHistory = [], userId = null) {
  if (!agent || !question) {
    return '停下来想想，你问的这个问题，背后真正担心的是什么？';
  }

  // 从 previousDialogues 提取参与的智囊列表（用于 team_map）
  const teamAgentIds = new Set(previousDialogues.map(d => d.agentId).filter(Boolean));
  const teamAgents = Array.from(teamAgentIds).map(id => AGENT_POOL_MAP[id]).filter(Boolean);

  // 三层提示词优先，降级到 persona
  const basePrompt = buildAgentSystemPrompt(agent, teamAgents);

  const systemPrompt = `${basePrompt}

【补充约束】
- 用中文口语，不要书面体
- 必须抓住用户问题里的具体词（数字、对象、场景），不要泛泛而谈
- 不要给"祝你顺利"之类的客套结尾
- 可以质疑用户、可以反问、可以泼冷水，但要说人话

【真Agent协作指令】
- 若前面有其他智囊发言，必须主动对其至少一位做明确表态：用"我同意X说的"、"反驳X的观点"、"补充X的判断"这类自然语言引用对方名字
- 不要各说各话，要让用户看到观点之间的碰撞
- 若发现前一位智囊遗漏了关键维度，主动补位（如钱谷没算隐性成本，你指出）
- 你的发言要建立在前面观点之上，而不是平行重述问题`;

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
        .map(d => `${d.speaker === 'agent' ? '你' : '用户'}: ${d.text}`)
        .join('\n');
  }

  // 跨推演记忆：检索用户历史推演中的相关记忆
  let crossSessionMemory = '';
  if (userId) {
    try {
      const memories = await retrieveMemories(userId, question, 2);
      if (memories && memories.length > 0) {
        crossSessionMemory = '\n\n【用户的历史推演记忆】\n' + memories.map(m => `- ${m.content}`).join('\n');
      }
    } catch (e) {
      // 静默失败
    }
  }

  const userPrompt = `用户问：「${question}」${contextText}${agentContextText}${crossSessionMemory}

请以 ${agent.name}（${agent.stance}）的身份，说 1-3 句话回应。不要复述用户问题。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 200, temperature: 0.9, timeout: 8000 }
    );

    if (text && text.trim()) {
      return text.trim().slice(0, 120);
    }

    return getLocalPreset(agent, question);
  } catch (e) {
    console.warn(`[agentEngine] ${agent.id} 生成失败，降级到本地预设:`, e.message);
    return getLocalPreset(agent, question);
  }
}

/**
 * 根据Agent和问题生成本地预设回应（每个Agent有独特预设）
 */
function getLocalPreset(agent, question) {
  const presets = AGENT_PRESETS[agent.id] || AGENT_PRESETS.jingyuan;
  const type = detectQuestionType(question);
  const idx = (type.charCodeAt(0) + agent.id.length) % presets.length;
  return presets[idx];
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

  // 三层提示词优先，降级到 persona
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
          const role = d.speaker === 'agent' ? `${AGENT_POOL_MAP[d.agentId]?.name || '未知'}` : '用户';
          return `${role}: ${d.text}`;
        })
        .join('\n');
  }

  const userPrompt = `用户问题：「${question}」${contextText}

请以 ${agent.name}（${agent.stance}）的身份，问一个能获取关键信息的问题。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 100, temperature: 0.8, timeout: 8000 }
    );

    if (text && text.trim()) {
      return { question: text.trim().slice(0, 80), needMoreInfo: true };
    }

    return getLocalQuestion(agent, question);
  } catch (e) {
    console.warn(`[agentEngine] ${agent.id} 生成问题失败，降级到本地预设:`, e.message);
    return getLocalQuestion(agent, question);
  }
}

/**
 * Agent本地预设问题
 */
const AGENT_QUESTIONS = {
  qiangu: [
    '你的期望薪资和底线薪资分别是多少？',
    '这个offer的总包结构是什么？base/bonus/equity各占多少？',
    '你目前的薪资结构是怎样的？',
    '如果选择这个，机会成本是多少？',
  ],
  luxiang: [
    '你3年后想成为什么样的人？',
    '这个选择能让你长出什么新能力？',
    '你最看重的是短期收益还是长期成长？',
    '这个行业的天花板在哪里？',
  ],
  fengyan: [
    '最坏的情况是什么？你能承受吗？',
    '什么信号出现会让你承认选错了？',
    '你忽略了哪些风险？',
    '如果失败，你的B计划是什么？',
  ],
  xinhe: [
    '你描述这件事时，身体是放松还是紧绷？',
    '如果没人看着，你会怎么选？',
    '你真正害怕的是选错，还是后悔没选？',
    '这件事让你兴奋还是焦虑？',
  ],
  jingyuan: [
    '上次类似的情况，你选了什么，后来呢？',
    '你问这个问题的方式，已经暴露了你的倾向，对吗？',
    '你敢对三个月后的自己说"我选了X"吗？',
    '这个"该"是谁的标准？',
  ],
  yuntu: [
    '你看的是过去6个月的涨势，还是看懂了底层逻辑？',
    '现在是周期的哪个位置？',
    '你是吃Beta红利，还是做Alpha？',
    '宏观环境对你的选择有什么影响？',
  ],
  zhenxing: [
    '今晚能做什么？第一刀切在哪里？',
    '再等一周，你会更清楚还是更焦虑？',
    '你在等什么？',
    '七成把握就该出手，你现在有几成？',
  ],
  duiyan: [
    '你真的和对方谈过你的纠结吗？',
    '对方真正在意的是什么？',
    '这话该对谁说、怎么说、在什么时机说？',
    '你表达的是诉求还是情绪？',
  ],
  falv: [
    '这件事有没有落进合同里？',
    '权责边界、违约后果、退出机制——这三件事清楚了吗？',
    '如果翻脸，你手里有什么牌？',
    '你现在的操作在法律上等于什么？',
  ],
  jiankang: [
    '这个选择会让你睡得着吗？',
    '睡眠、饮食、运动、情绪——哪个已经亮起红灯？',
    '三年后你的身体扛得住吗？',
    '你在透支式奋斗吗？',
  ],
  jiaoyu: [
    '这个选择能不能让你长出新能力？',
    '十年后回看，这个选择教会你什么？',
    '学习曲线、能力迁移、认知升级——哪个是你最需要的？',
    '你想变成什么样的人？',
  ],
  jishu: [
    '这事在工程上能不能落地？',
    '第一版最小可用是什么样？',
    '可行性、技术债务、架构权衡——哪个最让你担心？',
    '你今天能写的第一行代码是什么？',
  ],
};

function getLocalQuestion(agent, question) {
  const questions = AGENT_QUESTIONS[agent.id] || AGENT_QUESTIONS.jingyuan;
  const type = detectQuestionType(question);
  const idx = (type.charCodeAt(0) + agent.id.length) % questions.length;
  return { question: questions[idx], needMoreInfo: true };
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
- 最多追问2次，第2次后必须返回 false`;

  let contextText = '';
  if (dialogueHistory.length > 0) {
    contextText = '\n\n【对话历史】\n' +
      dialogueHistory
        .map((d) => {
          const role = d.speaker === 'agent' ? `${AGENT_POOL_MAP[d.agentId]?.name || '未知'}` : '用户';
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
export async function generateMasterSummary(originalQuestion, agentIds = [], dialogueHistory = {}) {
  if (!originalQuestion) {
    return {
      summary: '问题已分析完毕。请跟随本心做出选择。',
      options: [],
    };
  }

  const agentList = agentIds.map(id => AGENT_POOL_MAP[id]).filter(Boolean);

  let dialogueText = '';
  for (const id of agentIds) {
    const history = dialogueHistory[id] || [];
    if (history.length > 0) {
      const name = AGENT_POOL_MAP[id]?.name || id;
      dialogueText += `\n【${name}】\n${history.join('\n')}\n`;
    }
  }

  const systemPrompt = `你是"演"，推演核心，统领全局的太极Agent。

【任务】梳理所有Agent的对话，生成：
1. 全局总结 - 融合各Agent观点，指出关键矛盾和共识
2. 3个选项 - 每个选项代表一种决策方向，附带3个关键点摘要

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
- summary 要凝练，融合所有视角，指出矛盾和共识
- 每个选项代表一个真实可行的决策方向
- keyPoints 要从对话中提炼，不要凭空捏造
- guaRecommendation 要与选项的气质匹配（乾=进取，坤=守拙，离=光明，坎=险中求进等）
- 只返回JSON，不要其他文字`;

  const userPrompt = `用户原始问题：「${originalQuestion}」

【各Agent对话记录】
${dialogueText || '无详细对话记录'}

请梳理全局信息，生成总结和选项。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 500, temperature: 0.7, timeout: 10000 }
    );

    if (text) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const summary = parsed.summary || '';
        const options = Array.isArray(parsed.options) ? parsed.options : [];
        if (!summary || options.length === 0) {
          return generateLocalSummary(originalQuestion, agentList);
        }
        return { summary, options };
      }
    }

    return generateLocalSummary(originalQuestion, agentList);
  } catch (e) {
    console.warn('[agentEngine] 演生成总结失败，降级到本地总结:', e.message);
    return generateLocalSummary(originalQuestion, agentList);
  }
}

/**
 * 本地降级总结生成
 */
function generateLocalSummary(originalQuestion, agentList) {
  const type = detectQuestionType(originalQuestion);
  const stanceNames = agentList.map(a => a.name).join('、');

  const summaryTemplates = {
    offer: `诸位所议，各有道理。\n${stanceNames}从不同视角审视了这个选择。\n核心矛盾在于：短期收益与长期成长之间的权衡。\n是追求稳定还是拥抱变化，取决于你的本心。`,
    career: `${stanceNames}的分析揭示了关键维度：\n赛道选择、能力成长、风险承受度。\n没有绝对正确的答案，只有适合当下的选择。`,
    finance: `钱谷算清了账目，风眼提醒了风险，镜渊照见了本心。\n决策的关键在于：你能承受多大的不确定性？\n数字之外，还要看时机和周期。`,
    startup: `创业之路，九死一生。\n${stanceNames}的分析表明：\n准备是否充分、风险是否可控、初心是否坚定——这是成败的关键。`,
    life: `人生没有标准答案。\n${stanceNames}的追问，帮助你看清了自己真正想要的。\n跟随本心，便是最好的选择。`,
    default: `诸位智囊各抒己见，视角各异。\n核心在于：${stanceNames}的观点中，哪个最能触动你的内心？\n选择那条让你愿意对未来自己负责的路。`,
  };

  const summary = summaryTemplates[type] || summaryTemplates.default;

  const optionTemplates = {
    offer: [
      { label: '接受Offer', keyPoints: ['薪资提升明显', '短期收益确定', '行业前景看好'], guaRecommendation: '乾' },
      { label: '留在原地', keyPoints: ['风险可控', '现有资源积累', '等待更好机会'], guaRecommendation: '坤' },
      { label: '继续观望', keyPoints: ['收集更多信息', '评估其他机会', '不急于决策'], guaRecommendation: '离' },
    ],
    career: [
      { label: '全力冲刺', keyPoints: ['抓住风口', '快速成长', '承担更大责任'], guaRecommendation: '乾' },
      { label: '稳扎稳打', keyPoints: ['夯实基础', '降低风险', '积累资源'], guaRecommendation: '坤' },
      { label: '探索转型', keyPoints: ['尝试新领域', '跨界学习', '寻找新机会'], guaRecommendation: '巽' },
    ],
    default: [
      { label: '顺势而为', keyPoints: ['跟随大势', '把握时机', '借力而行'], guaRecommendation: '乾' },
      { label: '守拙待时', keyPoints: ['积蓄力量', '观察变化', '等待良机'], guaRecommendation: '坤' },
      { label: '破而后立', keyPoints: ['主动改变', '突破现状', '创造新局'], guaRecommendation: '震' },
    ],
  };

  return {
    summary,
    options: optionTemplates[type] || optionTemplates.default,
  };
}

export default {
  analyzeQuestion,
  generateAgentDialogue,
  generateAgentQuestion,
  shouldContinueAsking,
  generateMasterSummary,
};
