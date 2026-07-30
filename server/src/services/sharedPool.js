/**
 * 共享Agent池服务
 * 演的动态Agent生态 — 存储、匹配、淘汰
 *
 * 核心功能:
 * 1. 存储: 动态生成的Agent存入共享池
 * 2. 匹配: 通过指纹/相似度查找已存在的Agent
 * 3. 统计: 使用次数、质量评分、热度
 * 4. 淘汰: 低质量+低使用的Agent自动归档
 */

import { query } from './db.js';
import { AGENT_SOURCES, validateAgent, computeStanceSimilarity } from '../data/agentSchema.js';
import { generateUUID } from '../utils/id.js';

const TABLE = 'shared_agents';
const USAGE_LOG_TABLE = 'agent_usage_log';
const POPULAR_THRESHOLD = 50;
const ARCHIVE_DAYS = 30;
const MAX_POOL_SIZE = 500;

/**
 * 计算Agent指纹 = 维度perspectives的hash
 */
export function computeFingerprint(perspectives) {
  const sorted = [...(perspectives || [])].sort().join('+');
  let hash = 0;
  for (let i = 0; i < sorted.length; i++) {
    const chr = sorted.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * 存入新Agent或返回已存在的
 * @param {object} agent Agent对象
 * @param {string} question 原始问题 (用于usage_log)
 * @returns {Promise<{agent: object, isNew: boolean}>}
 */
export async function saveOrGetAgent(agent, question = '') {
  // 1. 检查指纹是否已存在
  const fp = computeFingerprint(agent.perspectives);
  const existing = await query({
    table: TABLE,
    action: 'select',
    filter: { fingerprint: fp, archived: 0 },
  });

  if (existing.rows.length > 0) {
    // 已存在，增加使用计数
    const found = existing.rows[0];
    await incrementUsage(found.id, question);
    return { agent: found, isNew: false };
  }

  // 2. 验证
  const { valid, errors } = validateAgent(agent);
  if (!valid) {
    throw new Error(`Agent 验证失败: ${errors.join(', ')}`);
  }

  // 3. 存入
  const id = agent.id || `dyn_${generateUUID().slice(0, 12)}`;
  const now = new Date();
  const record = {
    ...agent,
    id,
    fingerprint: fp,
    quality_score: agent.qualityScore ?? 1.0,
    usage_count: agent.usageCount ?? 0,
    positive_feedback: agent.positiveFeedback ?? 0,
    source: agent.source || AGENT_SOURCES.DYNAMIC,
    is_public: agent.isPublic ?? 1,
    archived: 0,
    created_at: now,
    updated_at: now,
    questiontypes: JSON.stringify(agent.questionTypes || []),
    perspectives: JSON.stringify(agent.perspectives || []),
    tags: JSON.stringify(agent.tags || []),
  };

  const result = await query({ table: TABLE, action: 'insert', data: record });
  const saved = result.rows[0];

  // 4. 记录使用
  await incrementUsage(id, question);

  return { agent: saved, isNew: true };
}

/**
 * 根据维度匹配共享池
 * @param {Array} dimensions 决策维度 [{ perspective, ... }]
 * @returns {Promise<Array>} 匹配的Agent列表
 */
export async function matchByDimensions(dimensions) {
  if (!dimensions || dimensions.length === 0) return [];

  const targetPerspectives = dimensions.map(d => d.perspective);
  const fp = computeFingerprint(targetPerspectives);

  // 1. 精确指纹匹配
  const exactMatch = await query({
    table: TABLE,
    action: 'select',
    filter: { fingerprint: fp, archived: 0 },
  });

  if (exactMatch.rows.length > 0) {
    return sortByQuality(exactMatch.rows);
  }

  // 2. 宽匹配: 相似度≥50%
  const allActive = await query({
    table: TABLE,
    action: 'select',
    filter: { archived: 0 },
  });

  const targetSet = new Set(targetPerspectives);
  const matched = allActive.rows.filter(agent => {
    const agentSet = new Set(parseJSONField(agent.perspectives));
    if (agentSet.size === 0) return false;
    let overlap = 0;
    for (const p of targetSet) {
      if (agentSet.has(p)) overlap++;
    }
    return overlap / Math.min(targetSet.size, agentSet.size) >= 0.5;
  });

  return sortByQuality(matched);
}

/**
 * 获取热门Agent (按使用次数)
 */
export async function getTrendingAgents(limit = 20) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { archived: 0 },
    queryOptions: { orderBy: 'usage_count:desc', limit: String(limit) },
  });
  return sortByQuality(result.rows);
}

/**
 * 获取指定来源的Agent
 */
export async function getAgentsBySource(source, limit = 50) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { source, archived: 0 },
    queryOptions: { orderBy: 'quality_score:desc', limit: String(limit) },
  });
  return result.rows;
}

/**
 * 根据ID获取Agent
 */
export async function getAgentById(id) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { id },
  });
  return result.rows[0] || null;
}

/**
 * 点赞
 */
export async function incrementPositiveFeedback(id) {
  const agent = await getAgentById(id);
  if (!agent) return null;
  const newScore = Math.min(1, (agent.quality_score || 1) + 0.05);
  await query({
    table: TABLE,
    action: 'update',
    id,
    data: {
      positive_feedback: (agent.positive_feedback || 0) + 1,
      quality_score: newScore,
    },
  });
  return { ...agent, positive_feedback: agent.positive_feedback + 1, quality_score: newScore };
}

/**
 * 点踩
 */
export async function decrementQuality(id) {
  const agent = await getAgentById(id);
  if (!agent) return null;
  const newScore = Math.max(0, (agent.quality_score || 1) - 0.15);
  await query({
    table: TABLE,
    action: 'update',
    id,
    data: { quality_score: newScore },
  });

  // 低分自动归档
  if (newScore < 0.4) {
    await archiveAgent(id);
  }

  return { ...agent, quality_score: newScore };
}

/**
 * 归档Agent
 */
export async function archiveAgent(id) {
  await query({
    table: TABLE,
    action: 'update',
    id,
    data: { archived: 1 },
  });
}

/**
 * 取消归档
 */
export async function unarchiveAgent(id) {
  await query({
    table: TABLE,
    action: 'update',
    id,
    data: { archived: 0 },
  });
}

/**
 * 删除Agent
 */
export async function deleteAgent(id) {
  await query({ table: TABLE, action: 'delete', id });
}

/**
 * 清理过期归档 (30天未使用的归档Agent)
 */
export async function cleanupExpiredArchives() {
  const cutoffDate = new Date(Date.now() - ARCHIVE_DAYS * 24 * 60 * 60 * 1000);
  // 在内存模式下简化实现
  const all = await query({ table: TABLE, action: 'select', filter: { archived: 1 } });
  let deleted = 0;
  for (const agent of all.rows) {
    const updated = new Date(agent.updated_at);
    if (updated < cutoffDate && (agent.usage_count || 0) < POPULAR_THRESHOLD) {
      await deleteAgent(agent.id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * 获取共享池统计
 */
export async function getPoolStats() {
  const all = await query({ table: TABLE, action: 'select', filter: {} });
  const rows = all.rows;
  return {
    total: rows.length,
    active: rows.filter(r => !r.archived).length,
    bySource: rows.reduce((acc, r) => {
      acc[r.source] = (acc[r.source] || 0) + 1;
      return acc;
    }, {}),
    avgQuality: rows.length > 0
      ? rows.reduce((sum, r) => sum + (r.quality_score || 0), 0) / rows.length
      : 0,
    totalUsage: rows.reduce((sum, r) => sum + (r.usage_count || 0), 0),
  };
}

// ============ 辅助函数 ============

async function incrementUsage(id, question = '') {
  const agent = await getAgentById(id);
  if (!agent) return;

  await query({
    table: TABLE,
    action: 'update',
    id,
    data: {
      usage_count: (agent.usage_count || 0) + 1,
    },
  });

  // 记录使用日志
  const logData = {
    agent_id: id,
    query_fingerprint: question ? computeFingerprint([question]) : null,
    used_for: question?.slice(0, 100) || '',
  };
  await query({ table: USAGE_LOG_TABLE, action: 'insert', data: logData });
}

function sortByQuality(agents) {
  return agents.sort((a, b) => {
    const scoreA = (a.quality_score || 0.5) * Math.log10((a.usage_count || 1) + 1);
    const scoreB = (b.quality_score || 0.5) * Math.log10((b.usage_count || 1) + 1);
    return scoreB - scoreA;
  });
}

function parseJSONField(field) {
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  }
  return [];
}

export default {
  saveOrGetAgent,
  matchByDimensions,
  getTrendingAgents,
  getAgentsBySource,
  getAgentById,
  incrementPositiveFeedback,
  decrementQuality,
  archiveAgent,
  unarchiveAgent,
  deleteAgent,
  cleanupExpiredArchives,
  getPoolStats,
  computeFingerprint,
};
