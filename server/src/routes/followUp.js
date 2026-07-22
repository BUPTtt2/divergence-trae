import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  scheduleFollowUp,
  getPendingFollowUps,
  completeFollowUp,
  checkAndNotify,
  getAllFollowUps,
} from '../services/followUpService.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.query.userId || req.get('X-User-Id') || 'anonymous';
    const status = req.query.status;

    if (status === 'pending') {
      const items = await getPendingFollowUps(userId);
      return res.json({ items, count: items.length });
    }

    if (status === 'check') {
      const notifyInfo = await checkAndNotify(userId);
      return res.json(notifyInfo);
    }

    const items = await getAllFollowUps(userId);
    res.json({ items, count: items.length });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.body.userId || req.get('X-User-Id') || 'anonymous';
    const { cardId, question, decision, daysLater } = req.body;

    const followUp = await scheduleFollowUp(userId, cardId, question, decision, daysLater);

    res.status(201).json({
      success: true,
      followUp,
    });
  })
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { result } = req.body;

    const updated = await completeFollowUp(id, result);

    if (!updated) {
      return res.status(404).json({ error: '回访记录不存在' });
    }

    res.json({
      success: true,
      followUp: updated,
    });
  })
);

export default router;
