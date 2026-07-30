/**
 * 种子Agent定义
 * 演的初始思维框架 — 12个核心Agent
 *
 * 从 agentPool.js 迁移而来，增加 perspectives 字段
 * perspectives: 每个Agent覆盖的决策维度标签
 * 用于AgentRouter的维度匹配
 */

import { AGENT_POOL } from './agentPool.js';

/**
 * 种子Agent的视角映射
 * key: agent id
 * value: perspectives 数组
 */
const SEED_PERSPECTIVES = {
  qiangu: ['financial', 'risk'],
  luxiang: ['strategic', 'action'],
  fengyan: ['risk', 'ethical'],
  xinhe: ['emotional', 'reflection'],
  jingyuan: ['reflection', 'ethical'],
  yuntu: ['macro', 'strategic'],
  zhenxing: ['action', 'practical'],
  duiyan: ['communication', 'relationship'],
  falv: ['legal', 'ethical'],
  jiankang: ['health', 'physical'],
  jiaoyu: ['education', 'strategic'],
  jishu: ['practical', 'technical'],
};

/**
 * 获取带perspectives的种子Agent列表
 * 兼容现有agentPool.js数据
 */
export function getSeedAgentsWithPerspectives() {
  return AGENT_POOL.map(agent => ({
    ...agent,
    perspectives: SEED_PERSPECTIVES[agent.id] || extractPerspectives(agent),
    source: 'seed',
  }));
}

/**
 * 从Agent的questionTypes和其他字段推断perspectives
 */
function extractPerspectives(agent) {
  const perspectives = new Set();
  const typeToPerspective = {
    finance: 'financial',
    career: 'strategic',
    risk: 'risk',
    relationship: 'emotional',
    life: 'reflection',
    action: 'action',
    communication: 'communication',
    startup: 'strategic',
    investment: 'financial',
    legal: 'legal',
    health: 'health',
    education: 'education',
    travel: 'experience',
    city: 'destination_info',
  };

  for (const qt of (agent.questionTypes || [])) {
    const p = typeToPerspective[qt];
    if (p) perspectives.add(p);
  }

  // 从stance推断
  const stance = (agent.stance || '').toLowerCase();
  const stanceMap = {
    '财务': 'financial',
    '职业': 'strategic',
    '风险': 'risk',
    '情感': 'emotional',
    '反思': 'reflection',
    '宏观': 'macro',
    '行动': 'action',
    '沟通': 'communication',
    '法律': 'legal',
    '健康': 'health',
    '教育': 'education',
    '体验': 'experience',
    '实践': 'practical',
  };

  for (const [keyword, p] of Object.entries(stanceMap)) {
    if (stance.includes(keyword)) {
      perspectives.add(p);
    }
  }

  return [...perspectives];
}

export { SEED_PERSPECTIVES };
export default {
  getSeedAgentsWithPerspectives,
  SEED_PERSPECTIVES,
};
