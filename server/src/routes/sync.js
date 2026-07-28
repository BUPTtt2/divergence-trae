/**
 * 数据同步路由 - 本地 localStorage → 云端数据库
 *
 * 支持迁移的数据类型：
 * - cards: 命签（按 user_id + question + gua 去重）
 * - user_memories: 记忆（按 user_id + type + content 去重）
 * - custom_advisors: 自定义智囊（按 user_id + name 去重）
 * - achievements: 成就（按 user_id + achievement_id 去重）
 *
 * 未登录时返回 success: false，不报错
 * 数据库不可用时降级（内存模式也能写入，但 serverless 冷启动会丢）
 */
import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { optionalAuth, requireUser } from '../middleware/auth.js';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';

const router = express.Router();

/**
 * 安全 JSON 字符串化（处理 undefined/null）
 */
function safeStringify(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return null; }
}

/**
 * POST /api/sync/migrate
 * 把本地 localStorage 数据迁移到云端（合并去重）
 * body: { data: { cards?, user_memories?, custom_advisors?, achievements? } }
 */
router.post(
  '/migrate',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.status(200).json({
        success: false,
        migrated: { cards: 0, user_memories: 0, custom_advisors: 0, achievements: 0 },
        skipped: 0,
        message: '未登录，跳过数据迁移',
      });
    }

    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: '缺少 data 参数' });
    }

    const userId = req.userId;
    const migrated = { cards: 0, user_memories: 0, custom_advisors: 0, achievements: 0 };
    let skipped = 0;

    // 1. 迁移命签 cards
    if (Array.isArray(data.cards)) {
      for (const card of data.cards) {
        try {
          // 去重：同 user_id + question + gua 视为已存在
          const exists = await query({
            table: 'cards',
            action: 'select',
            filter: { user_id: userId, question: String(card.question || '').slice(0, 500), gua: String(card.gua || '').slice(0, 20) },
            queryOptions: { limit: 1 },
          });
          if (exists.rowCount > 0) {
            skipped++;
            continue;
          }
          await query({
            table: 'cards',
            action: 'insert',
            data: {
              id: card.id || generateUUID(),
              user_id: userId,
              gua: String(card.gua || '').slice(0, 20),
              trigram: String(card.trigram || '').slice(0, 10),
              element: String(card.element || '').slice(0, 20),
              title: String(card.title || '').slice(0, 100),
              question: String(card.question || '').slice(0, 500),
              decision: String(card.decision || '').slice(0, 500),
              verse: String(card.verse || '').slice(0, 200),
              summary: String(card.summary || '').slice(0, 1000),
              advisors: safeStringify(card.advisors),
              rarity: String(card.rarity || '').slice(0, 20),
              style: String(card.style || '').slice(0, 50),
              pillars: safeStringify(card.pillars),
              powerful_question: String(card.powerful_question || '').slice(0, 500),
              framework: String(card.framework || '').slice(0, 200),
            },
          });
          migrated.cards++;
        } catch (e) {
          console.warn('[sync] card 迁移失败:', e.message);
          skipped++;
        }
      }
    }

    // 2. 迁移记忆 user_memories
    if (Array.isArray(data.user_memories)) {
      for (const mem of data.user_memories) {
        try {
          const content = String(mem.content || '').slice(0, 1000);
          if (!content) { skipped++; continue; }
          const exists = await query({
            table: 'user_memories',
            action: 'select',
            filter: { user_id: userId, type: String(mem.type || 'working'), content },
            queryOptions: { limit: 1 },
          });
          if (exists.rowCount > 0) {
            skipped++;
            continue;
          }
          await query({
            table: 'user_memories',
            action: 'insert',
            data: {
              id: mem.id || generateUUID(),
              user_id: userId,
              type: String(mem.type || 'working').slice(0, 20),
              content,
              meta: safeStringify(mem.meta || mem.question),
              importance: parseInt(mem.importance, 10) || 3,
            },
          });
          migrated.user_memories++;
        } catch (e) {
          console.warn('[sync] memory 迁移失败:', e.message);
          skipped++;
        }
      }
    }

    // 3. 迁移自定义智囊 custom_advisors
    if (Array.isArray(data.custom_advisors)) {
      for (const adv of data.custom_advisors) {
        try {
          const name = String(adv.name || '').slice(0, 50);
          if (!name) { skipped++; continue; }
          const exists = await query({
            table: 'custom_advisors',
            action: 'select',
            filter: { user_id: userId, name },
            queryOptions: { limit: 1 },
          });
          if (exists.rowCount > 0) {
            skipped++;
            continue;
          }
          await query({
            table: 'custom_advisors',
            action: 'insert',
            data: {
              id: adv.id || generateUUID(),
              user_id: userId,
              name,
              persona: String(adv.persona || '').slice(0, 2000),
              perspective: String(adv.perspective || adv.stance || '').slice(0, 100),
              style: String(adv.style || '周易古风').slice(0, 50),
              element: String(adv.element || '').slice(0, 20),
              trigram: String(adv.trigram || '').slice(0, 10),
            },
          });
          migrated.custom_advisors++;
        } catch (e) {
          console.warn('[sync] advisor 迁移失败:', e.message);
          skipped++;
        }
      }
    }

    // 4. 迁移成就 achievements
    if (Array.isArray(data.achievements)) {
      for (const ach of data.achievements) {
        try {
          const achievementId = String(ach.achievement_id || ach.id || '').slice(0, 100);
          if (!achievementId) { skipped++; continue; }
          const exists = await query({
            table: 'achievements',
            action: 'select',
            filter: { user_id: userId, achievement_id: achievementId },
            queryOptions: { limit: 1 },
          });
          if (exists.rowCount > 0) {
            skipped++;
            continue;
          }
          await query({
            table: 'achievements',
            action: 'insert',
            data: {
              id: generateUUID(),
              user_id: userId,
              achievement_id: achievementId,
              unlocked_at: ach.unlockedAt || new Date().toISOString(),
            },
          });
          migrated.achievements++;
        } catch (e) {
          console.warn('[sync] achievement 迁移失败:', e.message);
          skipped++;
        }
      }
    }

    res.json({
      success: true,
      migrated,
      skipped,
      syncedAt: new Date().toISOString(),
      message: `迁移完成：命签 ${migrated.cards}、记忆 ${migrated.user_memories}、智囊 ${migrated.custom_advisors}、成就 ${migrated.achievements}`,
    });
  })
);

/**
 * GET /api/sync/status
 * 获取同步状态和各表数据量
 */
router.get(
  '/status',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.json({
        lastSyncedAt: null,
        today: new Date().toISOString().split('T')[0],
        counts: { cards: 0, user_memories: 0, custom_advisors: 0, achievements: 0 },
        loggedIn: false,
      });
    }

    const userId = req.userId;
    const [cards, mems, advs, achs] = await Promise.all([
      query({ table: 'cards', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 200 } }),
      query({ table: 'user_memories', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 200 } }),
      query({ table: 'custom_advisors', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
      query({ table: 'achievements', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
    ]);

    res.json({
      lastSyncedAt: null,
      today: new Date().toISOString().split('T')[0],
      counts: {
        cards: cards.rowCount,
        user_memories: mems.rowCount,
        custom_advisors: advs.rowCount,
        achievements: achs.rowCount,
      },
      loggedIn: true,
    });
  })
);

/**
 * GET /api/sync/export
 * 导出当前用户全部数据（用于跨设备拉取）
 */
router.get(
  '/export',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.json({
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        user: null,
        cards: [],
        user_memories: [],
        custom_advisors: [],
        achievements: [],
      });
    }

    const userId = req.userId;
    const [cards, mems, advs, achs] = await Promise.all([
      query({ table: 'cards', action: 'select', filter: { user_id: userId }, queryOptions: { orderBy: 'created_at:desc', limit: 200 } }),
      query({ table: 'user_memories', action: 'select', filter: { user_id: userId }, queryOptions: { orderBy: 'created_at:desc', limit: 200 } }),
      query({ table: 'custom_advisors', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
      query({ table: 'achievements', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      user: { id: userId },
      cards: cards.rows,
      user_memories: mems.rows,
      custom_advisors: advs.rows,
      achievements: achs.rows,
    });
  })
);

/**
 * POST /api/sync/pull
 * 从云端拉取数据并返回（前端合并到本地）
 */
router.post(
  '/pull',
  requireUser,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const [cards, mems, advs, achs] = await Promise.all([
      query({ table: 'cards', action: 'select', filter: { user_id: userId }, queryOptions: { orderBy: 'created_at:desc', limit: 200 } }),
      query({ table: 'user_memories', action: 'select', filter: { user_id: userId }, queryOptions: { orderBy: 'created_at:desc', limit: 200 } }),
      query({ table: 'custom_advisors', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
      query({ table: 'achievements', action: 'select', filter: { user_id: userId }, queryOptions: { limit: 100 } }),
    ]);

    res.json({
      success: true,
      pulledAt: new Date().toISOString(),
      cards: cards.rows,
      user_memories: mems.rows,
      custom_advisors: advs.rows,
      achievements: achs.rows,
    });
  })
);

export default router;
