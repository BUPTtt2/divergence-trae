import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requirePrincipal } from '../middleware/principal.js';
import { query } from '../services/db.js';
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
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const userId = req.principal.userId;
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
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const userId = req.principal.userId;
    const { cardId, question, decision, daysLater } = req.body;
    const normalizedDays = Number(daysLater ?? 7);
    if (!Number.isInteger(normalizedDays) || normalizedDays < 1 || normalizedDays > 365) {
      return res.status(400).json({ error: 'daysLater 必须是 1 到 365 之间的整数' });
    }
    if (cardId) {
      const card = await query({
        table: 'cards',
        action: 'select',
        filter: { id: cardId, user_id: userId },
        queryOptions: { limit: 1 },
      });
      if (!card.rows[0]) return res.status(404).json({ error: '命签不存在或无权设置回访' });
      const existing = await query({
        table: 'decision_follow_ups',
        action: 'select',
        filter: { user_id: userId, card_id: cardId, status: 'pending' },
        queryOptions: { limit: 1 },
      });
      if (existing.rows[0]) {
        return res.status(200).json({ success: true, followUp: existing.rows[0], idempotentReplay: true });
      }
    }

    const followUp = await scheduleFollowUp(userId, cardId, question, decision, normalizedDays);

    res.status(201).json({
      success: true,
      followUp,
    });
  })
);

router.put(
  '/:id',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { result, status = 'neutral' } = req.body;
    if (!['positive', 'negative', 'neutral'].includes(status)) {
      return res.status(400).json({ error: 'status 必须是 positive、negative 或 neutral' });
    }

    const updated = await completeFollowUp(id, req.principal.userId, result, status);

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
