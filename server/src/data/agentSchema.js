/**
 * Agent 统一 Schema
 * 前后端共用的Agent数据结构定义和验证
 *
 * Agent 四层来源:
 *   seed    - 种子Agent (演的初始思维框架，12个)
 *   dynamic - 演生Agent (动态生成，存入共享池)
 *   user    - 用户共创Agent (手动创建或保存)
 *   custom  - 用户私有Agent (仅自己可见)
 */

// 视角标签 (演分析时使用的决策维度)
export const PERSPECTIVES = {
  FINANCIAL: 'financial',       // 财务视角
  RISK: 'risk',                 // 风险视角
  EMOTIONAL: 'emotional',       // 情感视角
  REFLECTION: 'reflection',     // 反思视角
  STRATEGIC: 'strategic',       // 战略/长期视角
  ACTION: 'action',             // 行动视角
  COMMUNICATION: 'communication', // 沟通视角
  MACRO: 'macro',               // 宏观视角
  HEALTH: 'health',             // 健康视角
  LEGAL: 'legal',               // 法律视角
  EDUCATION: 'education',       // 教育/成长视角
  EXPERIENCE: 'experience',     // 体验视角
  DESTINATION_INFO: 'destination_info', // 目的地/信息视角
  ETHICAL: 'ethical',           // 伦理/道德视角
  PRACTICAL: 'practical',       // 实操视角
};

export const PERSPECTIVE_LABELS = {
  financial: '财务',
  risk: '风险',
  emotional: '情感',
  reflection: '反思',
  strategic: '战略',
  action: '行动',
  communication: '沟通',
  macro: '宏观',
  health: '健康',
  legal: '法律',
  education: '成长',
  experience: '体验',
  destination_info: '信息',
  ethical: '伦理',
  practical: '实操',
};

// Agent 来源
export const AGENT_SOURCES = {
  SEED: 'seed',
  DYNAMIC: 'dynamic',
  USER: 'user',
  CUSTOM: 'custom',
};

// 问题类型 (通用分类)
export const QUESTION_TYPES = [
  'career', 'finance', 'relationship', 'life', 'action',
  'communication', 'offer', 'startup', 'invest', 'city',
  'legal', 'health', 'education', 'technical', 'product',
  'travel', 'daily', 'stress', 'family', 'parenting',
  'purchase', 'renovation', 'pet', 'move', 'study',
];

// 中国风传统色 (用于动态生成Agent)
export const CHINESE_COLORS = [
  '#C88848', // 金
  '#A84848', // 绛
  '#508870', // 黛
  '#685888', // 玄
  '#5078A8', // 青
  '#C86848', // 朱
  '#48A898', // 碧
  '#A87898', // 绛紫
  '#5858A8', // 靛
  '#88A848', // 竹
  '#A87848', // 赭
  '#7098A8', // 苍
  '#985878', // 胭脂
  '#B89858', // 鹅黄
  '#587858', // 松绿
];

/**
 * 验证Agent数据结构
 * @param {object} agent Agent对象
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateAgent(agent) {
  const errors = [];

  if (!agent.id || typeof agent.id !== 'string') {
    errors.push('id: 必须存在且为字符串');
  }

  if (!agent.name || !/^[\u4e00-\u9fff]{2,4}$/.test(agent.name)) {
    errors.push('name: 必须是2-4个中文字符');
  }

  if (!agent.stance || typeof agent.stance !== 'string') {
    errors.push('stance: 必须存在且为字符串');
  }

  if (!agent.identity || agent.identity.length < 20) {
    errors.push('identity: 必须存在且≥20字');
  }

  if (!agent.methodology || agent.methodology.length < 30) {
    errors.push('methodology: 必须存在且≥30字');
  }

  if (!agent.deliverable || agent.deliverable.length < 20) {
    errors.push('deliverable: 必须存在且≥20字');
  }

  if (!agent.persona || agent.persona.length < 20) {
    errors.push('persona: 必须存在且≥20字');
  }

  if (agent.source && !Object.values(AGENT_SOURCES).includes(agent.source)) {
    errors.push(`source: 必须是 ${Object.values(AGENT_SOURCES).join(', ')} 之一`);
  }

  if (agent.questionTypes && !Array.isArray(agent.questionTypes)) {
    errors.push('questionTypes: 必须是数组');
  }

  if (agent.perspectives && !Array.isArray(agent.perspectives)) {
    errors.push('perspectives: 必须是数组');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证决策维度结构
 * @param {object} dimension 维度对象
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateDimension(dimension) {
  const errors = [];

  if (!dimension.name || typeof dimension.name !== 'string') {
    errors.push('name: 必须存在且为字符串');
  }

  if (!dimension.perspective || !PERSPECTIVES[dimension.perspective.toUpperCase()]) {
    errors.push(`perspective: 必须是有效视角 (${Object.values(PERSPECTIVES).join(', ')})`);
  }

  if (dimension.importance && (dimension.importance < 1 || dimension.importance > 5)) {
    errors.push('importance: 必须在1-5之间');
  }

  if (dimension.coveredBy && !Array.isArray(dimension.coveredBy)) {
    errors.push('coveredBy: 必须是数组');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 从三层提示词构建 persona (向后兼容)
 */
export function buildPersona(agent) {
  return [
    agent.identity || '',
    agent.methodology || '',
    agent.deliverable || '',
  ].join('\n\n');
}

/**
 * 计算两个Agent的视角相似度 (0-1)
 * 用于检测动态生成的Agent是否与已有Agent重叠
 */
export function computeStanceSimilarity(agentA, agentB) {
  const perspectivesA = new Set(agentA.perspectives || []);
  const perspectivesB = new Set(agentB.perspectives || []);

  if (perspectivesA.size === 0 || perspectivesB.size === 0) return 0;

  let overlap = 0;
  for (const p of perspectivesA) {
    if (perspectivesB.has(p)) overlap++;
  }

  // 同时比较 stance 文本相似度 (简单实现)
  const stanceA = agentA.stance || '';
  const stanceB = agentB.stance || '';
  const wordsA = new Set(stanceA.split(''));
  const wordsB = new Set(stanceB.split(''));
  let wordOverlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) wordOverlap++;
  }
  const wordSim = wordsA.size > 0 ? wordOverlap / wordsA.size : 0;

  return (overlap / Math.min(perspectivesA.size, perspectivesB.size)) * 0.7 + wordSim * 0.3;
}

/**
 * 格式化Agent用于API输出 (移除内部字段)
 */
export function formatAgentForOutput(agent) {
  const {
    id, name, stance, color, glow, symbol,
    identity, methodology, deliverable, persona,
    questionTypes, perspectives, tags,
    source, fingerprint, qualityScore,
    usageCount, positiveFeedback,
    createdAt, updatedAt,
  } = agent;

  return {
    id, name, stance, color: color || '#888888', glow: glow || '#BBBBBB', symbol: symbol || '☯',
    identity, methodology, deliverable, persona,
    questionTypes: questionTypes || [],
    perspectives: perspectives || [],
    tags: tags || [],
    source,
    ...(fingerprint ? { fingerprint } : {}),
    ...(qualityScore !== undefined ? { qualityScore } : {}),
    ...(usageCount !== undefined ? { usageCount } : {}),
    ...(positiveFeedback !== undefined ? { positiveFeedback } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export default {
  PERSPECTIVES,
  PERSPECTIVE_LABELS,
  AGENT_SOURCES,
  QUESTION_TYPES,
  CHINESE_COLORS,
  validateAgent,
  validateDimension,
  buildPersona,
  computeStanceSimilarity,
  formatAgentForOutput,
};
