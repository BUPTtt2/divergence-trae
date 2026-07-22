/**
 * 本地数据 → 云端自动迁移
 *
 * 触发时机：AuthContext 初始化为 registered / anonymous（非 offline）时
 * - 首次登录后把 localStorage 数据合并到云端（去重）
 * - 成功后写入 yance_sync_migrated_at 标记，避免重复迁移
 * - 失败时静默降级，不抛错，用户继续用本地数据
 */

import { exportUserData } from '../utils/userStats.js';
import { migrateLocalData } from './apiClient.js';

const MIGRATED_AT_KEY = 'yance_sync_migrated_at';
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
