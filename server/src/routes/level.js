import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserLevel,
  addXP,
  recordLogin,
  checkDailyStreak,
  getAllRealms,
  XP_REWARDS,
} from '../services/levelService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.query.userId || req.get('X-User-Id') || 'anonymous';

    const userLevel = await getUserLevel(userId);
    const streakInfo = await checkDailyStreak(userId);
    const realms = getAllRealms();

    res.json({
      ...userLevel,
      streak: streakInfo.streak,
      alreadyCheckedIn: streakInfo.alreadyCheckedIn,
      realms,
      xpRewards: XP_REWARDS,
    });
  })
);

router.post(
  '/xp',
  asyncHandler(async (req, res) => {
    const userId = req.body.userId || req.get('X-User-Id') || 'anonymous';
    const { amount, reason } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '经验值必须为正数' });
    }

    if (!reason || !XP_REWARDS[reason]) {
      return res.status(400).json({ error: '无效的经验来源' });
    }

    const result = await addXP(userId, amount, reason);

    res.json({
      success: true,
      ...result,
    });
  })
);

router.post(
  '/checkin',
  asyncHandler(async (req, res) => {
    const userId = req.body.userId || req.get('X-User-Id') || 'anonymous';

    const result = await recordLogin(userId);

    res.json({
      success: true,
      ...result,
    });
  })
);

export default router;
