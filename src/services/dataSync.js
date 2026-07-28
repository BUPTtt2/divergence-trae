/**
 * 本地数据 ↔ 云端双向同步
 *
 * 上行（migrate）：AuthContext 登录成功后，把 localStorage 数据迁移到云端（去重）
 * 下行（pull）：登录后从云端拉取数据，合并到本地 localStorage
 *
 * 触发时机：AuthContext 初始化为 registered / anonymous（非 offline）时
 * - 先 pull（拉取云端最新数据合并到本地）
 * - 再 migrate（把本地新增数据上行到云端）
 * - 成功后写入 yance_sync_migrated_at 标记，避免重复迁移
 * - 失败时静默降级，不抛错，用户继续用本地数据
 */

import { exportUserData } from '../utils/userStats.js';
import { migrateLocalData, pullCloudData } from './apiClient.js';

const MIGRATED_AT_KEY = 'yance_sync_migrated_at';
const PULLED_AT_KEY = 'yance_sync_pulled_at';
const LOCAL_MEMORIES_KEY = 'yance_yan_memories_local';

/**
 * 收集本地数据并转换为后端 migrate 接口期望的格式
 */
function buildMigratePayload() {
  const local = exportUserData();

  // 自定义智囊 — 后端按 name + persona 去重
  const customAdvisors = Array.isArray(local.yance_custom_agents)
    ? local.yance_custom_agents
    : [];

  // 命签 — 后端按 question + gua + 时间窗去重
  const cards = Array.isArray(local.yance_collection)
    ? local.yance_collection
    : [];

  // 成就 — 本地格式 { id, unlockedAt } → 后端 { achievement_id }
  const achievements = Array.isArray(local.yance_achievements)
    ? local.yance_achievements
        .filter(a => a && a.id)
        .map(a => ({ achievement_id: a.id }))
    : [];

  // 演的记忆 — 本地 localStorage 单独存储
  let userMemories = [];
  try {
    const raw = localStorage.getItem(LOCAL_MEMORIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) userMemories = parsed;
    }
  } catch { /* ignore */ }

  return {
    custom_advisors: customAdvisors,
    cards: cards,
    achievements: achievements,
    user_memories: userMemories,
  };
}

/**
 * 统计本地待迁移条目总数
 */
function countLocalItems(payload) {
  return (
    (payload.custom_advisors?.length || 0) +
    (payload.cards?.length || 0) +
    (payload.achievements?.length || 0) +
    (payload.user_memories?.length || 0)
  );
}

/**
 * 把本地 localStorage 数据迁移到云端（合并去重）
 * @returns {Promise<{ migrated: Object, skipped: Object, total: number }>}
 *          失败时返回 { migrated: {}, skipped: {}, total: 0, error: string }
 */
export async function migrateLocalToCloud() {
  const payload = buildMigratePayload();
  const total = countLocalItems(payload);

  // 没有本地数据可迁移
  if (total === 0) {
    try {
      localStorage.setItem(MIGRATED_AT_KEY, new Date().toISOString());
    } catch { /* ignore */ }
    return { migrated: {}, skipped: {}, total: 0 };
  }

  try {
    const result = await migrateLocalData(payload);
    // 成功 → 标记已迁移
    try {
      localStorage.setItem(MIGRATED_AT_KEY, new Date().toISOString());
    } catch { /* ignore */ }
    return {
      migrated: result.migrated || {},
      skipped: result.skipped || {},
      total,
    };
  } catch (e) {
    return {
      migrated: {},
      skipped: {},
      total,
      error: e.message,
    };
  }
}

/**
 * 检查是否需要迁移
 * - 已有 migrated_at 标记 → 不需要
 * - 本地无数据 → 不需要
 * - 否则需要
 */
export function shouldMigrate() {
  try {
    if (localStorage.getItem(MIGRATED_AT_KEY)) return false;
  } catch { /* ignore */ }

  // 检查本地是否有可迁移的数据
  const payload = buildMigratePayload();
  return countLocalItems(payload) > 0;
}

/**
 * 自动迁移（如需要）— AuthContext 初始化为 registered/anonymous 时调用
 * 离线模式不调用
 */
export async function autoMigrateIfNeeded() {
  if (!shouldMigrate()) return null;
  return migrateLocalToCloud();
}

// ======================== 下行：云端 → 本地 ========================

/**
 * 安全读取 localStorage JSON
 */
function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 安全写入 localStorage JSON
 */
function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[dataSync] 写入失败', key, e.message);
  }
}

/**
 * 按字段去重合并两个数组
 */
function mergeById(local, cloud, idField = 'id') {
  const map = new Map();
  for (const item of local) {
    const k = item[idField] || item.question || JSON.stringify(item);
    map.set(k, item);
  }
  for (const item of cloud) {
    const k = item[idField] || item.question || JSON.stringify(item);
    if (!map.has(k)) map.set(k, item);
  }
  return Array.from(map.values());
}

/**
 * 从云端拉取数据并合并到本地 localStorage
 * @returns {Promise<{success: boolean, pulled: Object, merged: Object}>}
 */
export async function pullAndMergeCloudData() {
  try {
    const cloud = await pullCloudData();
    if (!cloud || !cloud.success) {
      return { success: false, pulled: {}, merged: {} };
    }

    const merged = { cards: 0, user_memories: 0, custom_advisors: 0, achievements: 0 };

    // 1. 合并命签 → yance_collection
    if (Array.isArray(cloud.cards) && cloud.cards.length > 0) {
      const local = safeRead('yance_collection', []);
      const mergedCards = mergeById(local, cloud.cards, 'id');
      safeWrite('yance_collection', mergedCards);
      merged.cards = mergedCards.length - local.length;
    }

    // 2. 合并记忆 → yance:memory:* + yance_yan_memories_local
    if (Array.isArray(cloud.user_memories) && cloud.user_memories.length > 0) {
      // 演对话记忆
      const localYanMems = safeRead(LOCAL_MEMORIES_KEY, []);
      const cloudYanMems = cloud.user_memories.filter(m => m.type === 'yan' || m.type === 'conversation');
      if (cloudYanMems.length > 0) {
        const mergedYanMems = mergeById(localYanMems, cloudYanMems, 'id');
        safeWrite(LOCAL_MEMORIES_KEY, mergedYanMems);
      }
      // 分层记忆（working/facts/episodes）
      for (const memType of ['working', 'facts', 'episodes', 'semantic']) {
        const key = `yance:memory:${memType}`;
        const localMems = safeRead(key, []);
        const cloudMems = cloud.user_memories.filter(m => m.type === memType);
        if (cloudMems.length > 0) {
          const mergedMems = mergeById(localMems, cloudMems, 'id');
          safeWrite(key, mergedMems);
        }
      }
      merged.user_memories = cloud.user_memories.length;
    }

    // 3. 合并自定义智囊 → yance_custom_agents
    if (Array.isArray(cloud.custom_advisors) && cloud.custom_advisors.length > 0) {
      const local = safeRead('yance_custom_agents', []);
      // 云端字段 perspective → stance 映射
      const cloudAgents = cloud.custom_advisors.map(a => ({
        id: a.id,
        name: a.name,
        stance: a.perspective || a.stance || '',
        persona: a.persona,
        style: a.style,
        element: a.element,
        trigram: a.trigram,
        createdAt: a.created_at,
      }));
      const mergedAgents = mergeById(local, cloudAgents, 'id');
      safeWrite('yance_custom_agents', mergedAgents);
      merged.custom_advisors = mergedAgents.length - local.length;
    }

    // 4. 合并成就 → yance_achievements
    if (Array.isArray(cloud.achievements) && cloud.achievements.length > 0) {
      const local = safeRead('yance_achievements', []);
      const cloudAchs = cloud.achievements.map(a => ({
        id: a.achievement_id,
        unlockedAt: a.unlocked_at,
      }));
      const mergedAchs = mergeById(local, cloudAchs, 'id');
      safeWrite('yance_achievements', mergedAchs);
      merged.achievements = mergedAchs.length - local.length;
    }

    // 标记已拉取
    try {
      localStorage.setItem(PULLED_AT_KEY, new Date().toISOString());
    } catch { /* ignore */ }

    return {
      success: true,
      pulled: {
        cards: cloud.cards?.length || 0,
        user_memories: cloud.user_memories?.length || 0,
        custom_advisors: cloud.custom_advisors?.length || 0,
        achievements: cloud.achievements?.length || 0,
      },
      merged,
    };
  } catch (e) {
    console.warn('[dataSync] 拉取云端数据失败:', e.message);
    return { success: false, pulled: {}, merged: {}, error: e.message };
  }
}

/**
 * 是否需要从云端拉取
 * - 从未拉取过 → 需要
 * - 距离上次拉取超过 10 分钟 → 需要
 */
export function shouldPull() {
  try {
    const last = localStorage.getItem(PULLED_AT_KEY);
    if (!last) return true;
    const elapsed = Date.now() - new Date(last).getTime();
    return elapsed > 10 * 60 * 1000; // 10 分钟
  } catch {
    return true;
  }
}

/**
 * 自动拉取（如需要）— 登录后调用
 */
export async function autoPullIfNeeded() {
  if (!shouldPull()) return null;
  return pullAndMergeCloudData();
}
