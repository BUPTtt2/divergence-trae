import { Router } from 'express';
import { query } from '../services/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const TABLE = 'achievements';

// 成就定义
const ACHIEVEMENT_DEFS = [
  { id: 'first', name: '初入卦门', desc: '完成第一次推演', icon: '☰', threshold: 1 },
  { id: 'thrice', name: '三卦成局', desc: '完成三次推演', icon: '☲', threshold: 3 },
  { id: 'seven', name: '七星连珠', desc: '完成七次推演', icon: '☵', threshold: 7 },
  { id: 'ten', name: '十卦归一', desc: '完成十次推演', icon: '☶', threshold: 10 },
  { id: 'twentyone', name: '太乙归元', desc: '完成二十一次推演', icon: '☱', threshold: 21 },
  { id: 'fifty', name: '大衍之数', desc: '完成五十次推演', icon: '☷', threshold: 50 },
];

/**
 * GET /api/achievements?userId=xxx
 * 获取用户成就，附带推演次数和已解锁成就
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.query.userId || req.get('X-User-Id') || 'anonymous';

    // 从 cards 表统计推演次数
    const cardsResult = await query({
      table: 'cards',
      action: 'select',
      filter: { user_id: userId },
    });
    const divinationCount = cardsResult.rowCount;

    // 查询已解锁的成就
    const unlockedResult = await query({
      table: TABLE,
      action: 'select',
      filter: { user_id: userId },
    });
    const unlockedMap = {};
    for (const row of unlockedResult.rows) {
      unlockedMap[row.achievement_id] = row.unlocked_at || row.created_at;
    }

    // 计算成就状态
    const achievements = ACHIEVEMENT_DEFS.map((def) => {
      const unlockedAt = unlockedMap[def.id];
      const shouldUnlock = divinationCount >= def.threshold;
      const isUnlocked = Boolean(unlockedAt) || shouldUnlock;

      // 如果应该解锁但还没记录，自动解锁
      if (shouldUnlock && !unlockedAt) {
        // 异步记录（不阻塞响应）
        query({
          table: TABLE,
          action: 'insert',
          data: {
            id: `${userId}_${def.id}`,
            user_id: userId,
            achievement_id: def.id,
            unlocked_at: new Date().toISOString(),
          },
        }).catch(() => {});
      }

      return {
        id: def.id,
        name: def.name,
        desc: def.desc,
        icon: def.icon,
        threshold: def.threshold,
        unlocked: isUnlocked,
        unlockedAt: unlockedAt || (shouldUnlock ? new Date().toISOString() : null),
        progress: Math.min(divinationCount, def.threshold),
      };
    });

    const unlockedCount = achievements.filter((a) => a.unlocked).length;

    res.json({
      userId,
      divinationCount,
      achievements,
      unlockedCount,
      totalAchievements: ACHIEVEMENT_DEFS.length,
    });
  })
);

export default router;
