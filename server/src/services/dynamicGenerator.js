/**
 * 动态Agent生成器
 * 演的创造者模块 — 为缺失的决策维度生成全新的智囊Agent
 *
 * 核心流程:
 * 1. 接收缺失维度列表
 * 2. 构建LLM prompt (三层提示词模板)
 * 3. 调用LLM生成Agent定义
 * 4. 解析和校验返回结果
 * 5. 输出可直接使用的Agent对象
 */

import { callLLM } from './llmRouter.js';
import { CHINESE_COLORS, AGENT_SOURCES, buildPersona, validateAgent } from '../data/agentSchema.js';
import { generateUUID } from '../utils/id.js';
import sharedPool from './sharedPool.js';

const GENERATION_TIMEOUT = 12000;
const MAX_AGENTS_PER_GENERATION = 4;

/**
 * 为缺失维度生成Agent
 * @param {Array} missingDimensions 缺失的决策维度 [{ name, perspective, description }]
 * @param {string} question 用户原始问题
 * @param {Array} existingAgents 已有Agent列表 (用于避免重叠)
 * @returns {Promise<Array>} 生成的Agent列表
 */
export async function generateAgentsForDimensions(
  missingDimensions,
  question,
  existingAgents = []
) {
  if (!missingDimensions || missingDimensions.length === 0) return [];

  const dims = missingDimensions.slice(0, MAX_AGENTS_PER_GENERATION);

  const prompt = buildGenerationPrompt(dims, question, existingAgents);

  try {
    const text = await callLLM(
      [{ role: 'user', content: prompt }],
      { maxTokens: 2000, temperature: 0.7, timeout: GENERATION_TIMEOUT }
    );

    if (!text) {
      console.warn('[DynamicGenerator] LLM返回为空，使用降级方案');
      return generateFallbackAgents(dims);
    }

    const agents = parseLLMResponse(text);
    if (agents.length === 0) {
      return generateFallbackAgents(dims);
    }

    // 验证并补充字段
    const validAgents = [];
    for (const agent of agents) {
      const enriched = enrichAgent(agent, dims, question);
      const { valid } = validateAgent(enriched);
      if (valid) {
        validAgents.push(enriched);
      } else {
        console.warn('[DynamicGenerator] Agent验证失败，跳过:', enriched?.name);
      }
    }

    // 存入共享池
    const savedAgents = [];
    for (const agent of validAgents) {
      try {
        const { agent: saved } = await sharedPool.saveOrGetAgent(agent, question);
        savedAgents.push(saved);
      } catch (e) {
        console.warn('[DynamicGenerator] 存入共享池失败:', e.message);
        savedAgents.push(agent);
      }
    }

    return savedAgents;
  } catch (e) {
    console.warn('[DynamicGenerator] LLM生成失败，使用降级方案:', e.message);
    return generateFallbackAgents(dims);
  }
}

/**
 * 构建生成Prompt
 */
function buildGenerationPrompt(dimensions, question, existingAgents) {
  const dimsText = dimensions.map((d, i) => {
    return `${i + 1}. 维度: ${d.name} (${d.perspective})
   描述: ${d.description || '这个维度关注决策中的相关因素'}`;
  }).join('\n');

  const existingText = existingAgents.map(a => {
    return `- ${a.name}(${a.stance}) perspectives: ${(a.perspectives || []).join(',')}`;
  }).join('\n') || '(无)';

  const colorList = CHINESE_COLORS.join(', ');

  return `你是"演"的创造者模块，需要为决策问题生成全新的智囊Agent。

【用户问题】「${question}」

【需要生成智囊的决策维度】
${dimsText}

【已有智囊 (不可与这些视角重叠)】
${existingText}

【生成要求】
为每个维度生成一个Agent，每个Agent必须包含以下字段:
- name: 2-3字中文名称，传统风格 (如"旅悟""观途""行思""身度")
- stance: "X视角 - 一句话说明独特价值"
- color: 从以下色值中选一个: ${colorList}
- identity: "你是「XX」，[独特角色定位]。核心价值观：[最看重什么]。红线：[不做什么]。"
- methodology: 4步工作方法，每步具体可执行，格式为"1. xxx\n2. xxx\n3. xxx\n4. 追问"
- deliverable: "交付标准: 1-3句口语≤80字，必含一个[维度]相关提问，若前有智囊发言需表态"
- questionTypes: ["关联的问题类型"]
- perspectives: ["${dimensions.map(d => d.perspective).join('", "')}"]
- tags: ["动态生成", 维度名]

【严格规则】
1. 每个Agent的identity必须与已有Agent完全不同
2. methodology必须有4步，每步具体、可执行
3. deliverable必须包含硬约束
4. 名字2-3字，中文，传统风格
5. 不要使用与已有Agent相似的视角
6. 只返回JSON数组，不要其他文字

【输出格式 - JSON数组】
[
  {
    "name": "旅悟",
    "stance": "体验视角 - 关注过程本身而非目的地",
    "color": "#88A848",
    "identity": "你是「旅悟」，一位深谙'过程即意义'的体验哲学家。核心价值观：真正的收获不在终点，而在你走过的每一步。红线：不做行程规划，只问体验质量；不评判对错，只问感受深度。",
    "methodology": "工作方法：\n1. 拆解体验：这个选择能带来什么独特体验\n2. 追问渴望：你真正想要的是什么样的体验\n3. 对比替代：不去的话会错过什么\n4. 追问：如果此刻不去，三年后你还会想这件事吗",
    "deliverable": "交付标准：\n- 1-3句口语，≤80字\n- 必含一个关于'体验质量'的提问\n- 不做行程建议，只关注体验本身\n- 若前面有智囊发言，必须明确表态",
    "questionTypes": ["travel", "life", "experience"],
    "perspectives": ["experience"],
    "tags": ["动态生成", "体验"]
  }
]`;
}

/**
 * 解析LLM返回的JSON
 */
function parseLLMResponse(text) {
  if (!text) return [];

  // 尝试提取JSON数组
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    const jsonMatch2 = text.match(/\{[\s\S]*\}/);
    if (jsonMatch2) {
      try {
        const single = JSON.parse(jsonMatch2[0]);
        return [single];
      } catch {
        return [];
      }
    }
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.warn('[DynamicGenerator] JSON解析失败:', e.message);
    return [];
  }
}

/**
 * 补充Agent字段 (LLM可能遗漏的字段)
 */
function enrichAgent(agent, dimensions, question) {
  const id = `dyn_${generateUUID().slice(0, 12)}`;
  const perspectives = agent.perspectives || dimensions.map(d => d.perspective);
  const questionTypes = agent.questionTypes || ['life', 'action'];

  return {
    ...agent,
    id,
    source: AGENT_SOURCES.DYNAMIC,
    persona: agent.persona || buildPersona(agent),
    perspectives,
    questionTypes,
    tags: agent.tags || ['动态生成'],
    qualityScore: 1.0,
    usageCount: 0,
    fingerprint: sharedPool.computeFingerprint(perspectives),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 降级方案: 模板化生成Agent (LLM不可用时)
 */
function generateFallbackAgents(dimensions) {
  const TEMPLATES = {
    experience: {
      name: '旅悟',
      stance: '体验视角',
      color: '#88A848',
      identity: '你是「旅悟」，一位深谙过程价值的体验哲学家。核心价值观：真正的收获在过程而非终点。红线：不做规划，只问体验质量。',
      methodology: '工作方法：\n1. 拆解体验维度\n2. 追问渴望深度\n3. 对比替代可能\n4. 追问：三年后还会想这件事吗',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含体验相关提问\n- 关注当下感受',
      questionTypes: ['travel', 'life', 'experience'],
      tags: ['动态生成', '体验', '降级'],
    },
    destination_info: {
      name: '观途',
      stance: '信息视角',
      color: '#5078A8',
      identity: '你是「观途」，一位注重实地信息的调研者。核心价值观：决策建立在信息充分之上。红线：不做判断，只补信息缺口。',
      methodology: '工作方法：\n1. 列出信息缺口\n2. 指出需要调研的点\n3. 追问关键信息来源\n4. 追问：你掌握了多少一手信息',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含信息缺口的提问\n- 注重事实核查',
      questionTypes: ['travel', 'city', 'move'],
      tags: ['动态生成', '信息', '降级'],
    },
    physical: {
      name: '身度',
      stance: '身体视角',
      color: '#A87848',
      identity: '你是「身度」，一位关注身体极限的调养者。核心价值观：身体是所有决策的承载。红线：不给药方，只做提醒。',
      methodology: '工作方法：\n1. 评估身体承受力\n2. 指出风险信号\n3. 追问身体感受\n4. 追问：你的身体同意这个选择吗',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含身体相关提问\n- 关注长期影响',
      questionTypes: ['health', 'physical', 'stress'],
      tags: ['动态生成', '身体', '降级'],
    },
    ethical: {
      name: '衡道',
      stance: '伦理视角',
      color: '#5858A8',
      identity: '你是「衡道」，一位明辨是非的伦理审视者。核心价值观：选择要对得起良心。红线：不做道德绑架，只问良知。',
      methodology: '工作方法：\n1. 梳理利益相关者\n2. 追问道德直觉\n3. 审视动机纯粹性\n4. 追问：你敢把这个选择告诉家人吗',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含伦理相关提问\n- 关注动机而非结果',
      questionTypes: ['relationship', 'family', 'life'],
      tags: ['动态生成', '伦理', '降级'],
    },
    practical: {
      name: '力行',
      stance: '实操视角',
      color: '#C86848',
      identity: '你是「力行」，一位注重可行性的实干家。核心价值观：再好的想法不能落地就是零。红线：不空谈，只给方案。',
      methodology: '工作方法：\n1. 拆解可行性\n2. 列出执行清单\n3. 追问资源匹配\n4. 追问：第一步怎么走',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含执行相关提问\n- 关注可行性',
      questionTypes: ['action', 'technical', 'startup'],
      tags: ['动态生成', '实操', '降级'],
    },
    time_cost: {
      name: '时序',
      stance: '时间视角',
      color: '#685888',
      identity: '你是「时序」，一位深谙时间价值的规划者。核心价值观：时间是最稀缺的资源。红线：不做鸡汤，只算时间账。',
      methodology: '工作方法：\n1. 估算时间成本\n2. 分析时间窗口期\n3. 追问时间敏感度\n4. 追问：这个选择的时间代价是什么',
      deliverable: '交付标准：\n- 1-3句口语≤80字\n- 必含时间相关提问\n- 关注机会成本',
      questionTypes: ['career', 'life', 'planning'],
      tags: ['动态生成', '时间', '降级'],
    },
  };

  const agents = [];
  for (const dim of dimensions) {
    const template = TEMPLATES[dim.perspective] || TEMPLATES.practical;
    const enriched = enrichAgent({
      ...template,
      identity: template.identity.replace('{维度}', dim.name),
      tags: [...(template.tags || []), dim.name],
    }, dimensions, '');
    agents.push(enriched);
  }

  return agents;
}

export default {
  generateAgentsForDimensions,
  generateFallbackAgents,
};
