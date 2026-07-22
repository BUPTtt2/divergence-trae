/**
 * 智囊发言引擎
 *
 * - analyzeQuestion：根据问题匹配智囊，返回 4-6 位
 * - generateAgentDialogue：单个智囊发言（LLM 优先，本地降级）
 * - generateSummary：演的总结，给出 3 个差异化选项
 * - selectSmartDialogue：本地降级发言，多变体避免模板感
 *
 * LLM 不可用或失败时降级本地逻辑，本地发言也要有变体。
 */

import { AGENTS, MASTER_AGENT, getAgentById } from './agentPool.js';
import { isLlmAvailable, chatCompletion } from './llm.js';

/* ------------------------------------------------------------------ *
 * 问题分析 & 智囊匹配
 * ------------------------------------------------------------------ */

const QUESTION_KEYWORDS = [
  { type: 'financial', keywords: ['钱', '财务', '收入', '成本', '投资', '回本', '利润', '变现', '薪资', '工资', '买', '卖', '报价'], agents: ['qiang', 'fengyan', 'yuntu', 'jingyuan', 'luxiang', 'xinhe'] },
  { type: 'career', keywords: ['工作', '职业', '跳槽', '升职', '辞职', 'offer', '方向', '选择', '岗位', '行业', '创业', '团队'], agents: ['luxiang', 'qiang', 'fengyan', 'jingyuan', 'yuntu', 'xinhe'] },
  { type: 'relationship', keywords: ['关系', '感情', '爱情', '恋爱', '分手', '复合', '婚姻', '朋友', '家人', '父母', '同事'], agents: ['xinhe', 'jingyuan', 'fengyan', 'luxiang', 'qiang', 'yuntu'] },
  { type: 'decision', keywords: ['要不要', '应该', '选', '决定', '决策', '怎么办', '如何', '是否', '该不该'], agents: ['jingyuan', 'luxiang', 'fengyan', 'qiang', 'xinhe', 'yuntu'] },
  { type: 'risk', keywords: ['风险', '担心', '害怕', '危险', '后果', '损失', '会不会失败', '稳妥', '安全'], agents: ['fengyan', 'yuntu', 'qiang', 'jingyuan', 'luxiang', 'xinhe'] },
  { type: 'growth', keywords: ['成长', '学习', '提升', '未来', '发展', '规划', '长期', '五年', '十年', '意义'], agents: ['luxiang', 'jingyuan', 'yuntu', 'xinhe', 'qiang', 'fengyan'] },
];

const DEFAULT_AGENTS = ['jingyuan', 'luxiang', 'fengyan', 'qiang'];

/**
 * 根据问题匹配智囊
 */
export function analyzeQuestion(env, question) {
  const q = (question || '').toLowerCase();

  let matched = null;
  let matchedType = 'general';

  for (const rule of QUESTION_KEYWORDS) {
    const hit = rule.keywords.some((k) => q.includes(k.toLowerCase()));
    if (hit) {
      matched = rule;
      matchedType = rule.type;
      break;
    }
  }

  // 取 4-6 个智囊（默认 4，匹配时 5-6）
  const agentIds = matched ? matched.agents.slice(0, 5) : DEFAULT_AGENTS;
  const agents = agentIds
    .map((id) => getAgentById(id))
    .filter(Boolean);

  const reasoning = matched
    ? `问题涉及${labelOfType(matchedType)}，匹配智囊：${agents.map((a) => a.name).join('、')}。`
    : '问题类型不显著，按默认组合召集智囊：镜渊、路向、风眼、钱谷。';

  const analysis = {
    questionType: matchedType,
    keywords: matched ? matched.keywords.filter((k) => q.includes(k.toLowerCase())) : [],
    suggestedAgents: agentIds,
  };

  return { agents, reasoning, questionType: matchedType, analysis };
}

function labelOfType(type) {
  const map = {
    financial: '财务实操',
    career: '职业方向',
    relationship: '人际关系',
    decision: '决策选择',
    risk: '风险评估',
    growth: '成长规划',
    general: '综合',
  };
  return map[type] || '综合';
}

/* ------------------------------------------------------------------ *
 * 单个智囊发言
 * ------------------------------------------------------------------ */

/**
 * 调用 LLM 生成智囊发言
 */
async function llmDialogue(env, agent, question, previousDialogues, sessionHistory) {
  if (!isLlmAvailable(env)) return null;

  // 系统提示
  const sys = `${agent.systemPrompt}

【角色定位】
你是一位独立的智囊，与其他智囊共同参与决策推演。你的任务是：
1. 从你的专业视角分析问题，给出独特见解
2. 认真倾听其他智囊的发言，识别其观点中的合理之处和不足之处
3. 如有不同意见，明确提出反驳并给出你的理由
4. 如同意某观点，可以补充更多细节或提出深化建议

【辩论规则】
- 尊重事实，基于逻辑进行辩论
- 引用其他智囊的具体观点进行回应
- 避免人身攻击，聚焦观点本身
- 可以提出新的角度或问题，推动讨论深入

【输出要求】
- 不超过 250 字
- 直接进入观点，不要寒暄、不要重复问题
- 必须给一个具体可挑刺或可执行的细节（数字、场景、反问）
- 如果前面有智囊发言，必须对其中至少一位的观点做出回应（同意、补充或反驳）
- 风格可以带周易古意，但不要堆砌卦辞`;

  // 用户消息：包含问题与前面智囊的观点
  const prev = (previousDialogues || [])
    .map((d) => `${d.name}（${d.agentId}）：${d.text}`)
    .join('\n\n');

  const userContent = `问题：${question}
${prev ? `\n其他智囊的发言：\n${prev}\n\n请基于你的视角分析问题，并对上述发言做出回应（同意、补充或反驳）。` : '请基于你的视角给出观点。'}`;

  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: userContent },
  ];

  const text = await chatCompletion(env, messages, {
    temperature: 0.9,
    maxTokens: 500,
  });

  return text;
}

/**
 * 单个智囊发言（LLM 优先，本地降级）
 *
 * @param {Object} env
 * @param {Object} agent — 智囊对象
 * @param {string} question
 * @param {Array} previousDialogues — [{ agentId, name, text }]
 * @param {Object} sessionHistory — 可选，会话历史
 * @returns {Promise<{ agentId: string, text: string }>}
 */
export async function generateAgentDialogue(env, agent, question, previousDialogues = [], sessionHistory = null) {
  if (!agent) {
    return { agentId: null, text: '智囊未到，且问其他。' };
  }

  // 优先 LLM
  let text = null;
  try {
    text = await llmDialogue(env, agent, question, previousDialogues, sessionHistory);
  } catch (err) {
    console.warn('[agentEngine] LLM 发言失败，降级本地:', err.message);
  }

  if (!text) {
    text = selectSmartDialogue(agent.id, question, null, agent, previousDialogues);
  }

  return { agentId: agent.id, text };
}

/* ------------------------------------------------------------------ *
 * 演的总结
 * ------------------------------------------------------------------ */

/**
 * LLM 生成总结
 */
async function llmSummary(env, question, dialogues, agents) {
  if (!isLlmAvailable(env)) return null;

  const sys = `${MASTER_AGENT.systemPrompt}

【角色定位】
你是"演"，是多Agent团队的总指挥。你的职责是：
1. 深入分析所有智囊的观点，提炼共识与分歧
2. 识别关键矛盾点和潜在风险
3. 基于全局视角做出最终判断
4. 给出差异化的行动选项，每个选项包含清晰的利弊分析

【分析框架】
- 共识点：哪些观点是智囊们一致认同的？
- 分歧点：哪些观点存在冲突？为什么？
- 风险提示：哪些问题被忽视了？最坏情况是什么？
- 机会窗口：当前时机是否合适？

【输出要求】
- 必须返回 JSON，结构如下：
{
  "summary": "不超过 200 字的总结，包含共识、分歧和核心判断",
  "analysis": {
    "consensus": ["共识点1", "共识点2"],
    "conflicts": ["冲突点1", "冲突点2"],
    "risks": ["风险提示1", "风险提示2"],
    "opportunities": ["机会点1", "机会点2"]
  },
  "options": [
    { 
      "title": "选项标题(6字以内)", 
      "description": "一句话描述", 
      "keyPoints": ["要点1","要点2","要点3"],
      "pros": ["优势1", "优势2"],
      "cons": ["风险1", "风险2"]
    },
    { "title": "...", "description": "...", "keyPoints": [...], "pros": [...], "cons": [...] },
    { "title": "...", "description": "...", "keyPoints": [...], "pros": [...], "cons": [...] }
  ],
  "recommendation": "基于卦象和分析，推荐哪个选项及理由"
}
- 三个选项必须差异化：保守 / 激进 / 折中 或 类似维度上的对比
- 不要复述智囊观点，要给出新的判断和洞察
- 每个选项必须包含 pros 和 cons，帮助用户权衡
- 只返回 JSON，不要前后任何文字`;

  const dialogueText = dialogues
    .map((d) => `${d.name}（${d.agentId}）：${d.text}`)
    .join('\n\n');

  const userContent = `问题：${question}

智囊发言：
${dialogueText}

请综合以上信息，做出全局分析和决策建议。`;

  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: userContent },
  ];

  const text = await chatCompletion(env, messages, {
    temperature: 0.7,
    maxTokens: 1000,
  });

  if (!text) return null;

  // 尝试提取 JSON
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length < 3) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 生成的总结（LLM 优先，本地降级）
 */
export async function generateSummary(env, question, dialogues = [], agents = []) {
  let result = null;
  try {
    result = await llmSummary(env, question, dialogues, agents);
  } catch (err) {
    console.warn('[agentEngine] LLM 总结失败，降级本地:', err.message);
  }

  if (!result) {
    result = localSummary(question, dialogues, agents);
  }

  return result;
}

/**
 * 本地降级总结
 */
function localSummary(question, dialogues = [], agents = []) {
  const hasRisk = dialogues.some((d) => /风险|危险|损失|反噬|后悔/.test(d.text));
  const hasOpportunity = dialogues.some((d) => /机会|可能|可行|顺/.test(d.text));
  const hasCost = dialogues.some((d) => /成本|钱|投入|回报/.test(d.text));
  const hasEmotion = dialogues.some((d) => /心|感受|想|愿/.test(d.text));
  const hasDirection = dialogues.some((d) => /方向|未来|长期|三年/.test(d.text));

  const analysis = {
    consensus: [],
    conflicts: [],
    risks: [],
    opportunities: [],
  };

  if (hasRisk && hasOpportunity) {
    analysis.consensus.push('风险与机遇并存');
    analysis.conflicts.push('是否值得冒险');
  }
  if (hasCost) {
    analysis.consensus.push('财务维度需量化');
    analysis.risks.push('隐性成本可能被忽视');
  }
  if (hasEmotion) {
    analysis.consensus.push('内心真实意愿重要');
    analysis.conflicts.push('理性与感性的权衡');
  }
  if (hasDirection) {
    analysis.opportunities.push('长期价值值得关注');
  }

  const summary = `诸智囊就"${truncate(question, 24)}"展开推演。
${analysis.consensus.length ? `共识：${analysis.consensus.join('，')}。` : ''}
${analysis.conflicts.length ? `分歧：${analysis.conflicts.join('，')}。` : ''}
${analysis.risks.length ? `风险：${analysis.risks.join('，')}。` : ''}
分歧与共识并存，请你自决。`;

  return {
    summary,
    analysis,
    options: [
      {
        title: '稳守',
        description: '暂缓行动，先补足信息与底气。',
        keyPoints: ['梳理最坏情况', '量化关键变量', '设定触发条件'],
        pros: ['降低风险', '保留选择权', '时间换空间'],
        cons: ['可能错失机会', '拖延成本', '局势可能恶化'],
      },
      {
        title: '进取',
        description: '顺象而动，把握当下时机。',
        keyPoints: ['锁定核心动作', '设定里程碑', '保留退出路径'],
        pros: ['抓住窗口期', '先发优势', '破局机会'],
        cons: ['风险较高', '试错成本', '不确定性大'],
      },
      {
        title: '折中',
        description: '小步试探，验证后再扩。',
        keyPoints: ['设计小规模实验', '一周复盘', '据反馈加码或撤'],
        pros: ['平衡风险与机会', '快速验证', '灵活调整'],
        cons: ['可能不够果断', '节奏偏慢', '两边不沾'],
      },
    ],
    recommendation: '三策各有长短，需结合你的风险承受能力与时间窗口综合考量。',
  };
}

/* ------------------------------------------------------------------ *
 * 本地降级发言（多变体）
 * ------------------------------------------------------------------ */

const ENTRY_VARIANTS = {
  qiang: [
    '先把账算明白。',
    '问个最直白的：值多少。',
    '我不绕弯，直接说钱。',
  ],
  luxiang: [
    '且把目光放远三年。',
    '站在五年后回看今天，',
    '方向比速度更要紧。',
  ],
  fengyan: [
    '我得说点不中听的。',
    '先把最坏情况摆上台。',
    '容我直说风险。',
  ],
  xinhe: [
    '先听你说完心里那句话。',
    '我想先问你的感受。',
    '情绪先于道理。',
  ],
  jingyuan: [
    '先反问一句。',
    '且慢，先看问题本身。',
    '我倒想从这个问题入手。',
  ],
  yuntu: [
    '先把这个问题放到更大的图里看。',
    '谁是受益者，谁是承担者？',
    '退一步看系统而非个体。',
  ],
};

const CLOSING_VARIANTS = [
  '此一节，留你自己参。',
  '余不一一，自行决断。',
  '话止于此，慎思。',
  '就此打住，再问恐扰。',
];

/**
 * 本地降级发言
 *
 * @param {string} agentId
 * @param {string} question
 * @param {string|null} questionType
 * @param {Object} agent
 * @param {Array} previousDialogues
 */
export function selectSmartDialogue(agentId, question, questionType, agent, previousDialogues = []) {
  const entries = ENTRY_VARIANTS[agentId] || ['且听一言。'];
  const entry = entries[Math.floor(Math.random() * entries.length)];
  const closing = CLOSING_VARIANTS[Math.floor(Math.random() * CLOSING_VARIANTS.length)];

  // 前面智囊的发言引用
  let ref = '';
  if (previousDialogues.length) {
    const last = previousDialogues[previousDialogues.length - 1];
    ref = `方才${last.name}所言"${truncate(last.text, 24)}"，`;
    // 不同视角的回应
    const isChallenge = Math.random() < 0.5;
    if (isChallenge) {
      ref += `我不尽同意。`;
    } else {
      ref += `可作一旁证。`;
    }
  }

  // 主体：根据视角给出 1-2 句话
  const body = localBody(agentId, question, agent);

  return `${entry}${ref ? ' ' + ref : ''}${body} ${closing}`;
}

function localBody(agentId, question, agent) {
  const q = question || '';
  const qShort = truncate(q, 30);

  switch (agentId) {
    case 'qiang':
      return `此事当先问成本与回本周期。若说不清这两个数，决策无立足处。${qShort ? `就"${qShort}"而言，至少需量化三个数字：投入、风险敞口、回收期。` : ''}`;
    case 'luxiang':
      return `今日之选决定三年之图。${qShort ? `就"${qShort}"，先问自己：选了之后通向哪一条岔路？放弃的又是什么？` : ''}`;
    case 'fengyan':
      return `挑最不愿听的一点说：若一年后回头看会后悔，悔在何处？请先把这场景想清楚。`;
    case 'xinhe':
      return `先问心，再问理。你嘴上不要的，心里其实想要吗？把这件事真正的情绪成本算上。`;
    case 'jingyuan':
      return `先反问一句：你为什么问这个问题？换一种问法，结论会反过来吗？请试着改写一遍你的问题。`;
    case 'yuntu':
      return `退一步看系统：这件事处在哪些更大的系统里？谁是受益者，谁是承担者？把视角抬高再决定。`;
    default:
      return `观此问，宜慎思。`;
  }
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

/**
 * 取所有智囊（导出方便其他模块使用）
 */
export function listAgents() {
  return AGENTS;
}
