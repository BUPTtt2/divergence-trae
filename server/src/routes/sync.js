import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

router.post(
  '/migrate',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.status(200).json({
        success: false,
        migrated: 0,
        skipped: 0,
        message: '未登录，跳过数据迁移',
      });
    }

    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: '缺少 data 参数' });
    }

    try {
      let migrated = 0;
      let skipped = 0;

      if (data.cards && Array.isArray(data.cards)) {
        for (const card of data.cards) {
          skipped++;
        }
      }

      if (data.memories && Array.isArray(data.memories)) {
        for (const mem of data.memories) {
          skipped++;
        }
      }

      res.json({
        success: true,
        migrated,
        skipped,
        syncedAt: new Date().toISOString(),
        message: '数据迁移完成（当前版本跳过实际写入，仅计数）',
      });
    } catch (e) {
      res.status(500).json({ error: '迁移失败', message: e.message });
    }
  })
);

router.get(
  '/status',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({
      lastSyncedAt: null,
      today: new Date().toISOString().split('T')[0],
      counts: { cards: 0, memories: 0, sessions: 0 },
    });
  })
);

router.get(
  '/export',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json({
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      user: null,
      cards: [],
      memories: [],
      sessions: [],
    });
  })
);

export default router;