import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireOwnedDeliberation, requirePrincipal } from '../middleware/principal.js';
import { distributedRateLimit } from '../middleware/distributedRateLimit.js';
import { createGeneralFeedback, upsertFeedback } from '../services/feedbackService.js';

const router = Router();

router.post(
  '/',
  distributedRateLimit({ scope: 'public_feedback', limit: 5, windowSeconds: 15 * 60 }),
  asyncHandler(async (req, res) => {
    if (String(req.body?.website || '').trim()) return res.status(202).json({ accepted: true });
    const interactionMs = Number(req.body?.interactionMs);
    if (Number.isFinite(interactionMs) && interactionMs >= 0 && interactionMs < 600) {
      return res.status(202).json({ accepted: true });
    }
    try {
      const result = await createGeneralFeedback({
        payload: req.body,
        idempotencyKey: req.get('Idempotency-Key'),
        requestSubject: req.ip || req.socket?.remoteAddress,
      });
      return res.status(result.created ? 201 : 200).json({ feedback: result.feedback });
    } catch (error) {
      if (error?.code === 'INVALID_FEEDBACK') return res.status(400).json({ error: error.code, message: error.message });
      throw error;
    }
  }),
);

router.put(
  '/:sessionId',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res) => {
    try {
      const feedback = await upsertFeedback({
        userId: req.principal.userId,
        sessionId: req.params.sessionId,
        payload: req.body,
        metadata: {
          releaseId: req.body?.releaseId,
          mode: req.body?.mode,
          deviceClass: req.body?.deviceClass,
        },
      });
      res.json({ feedback });
    } catch (error) {
      if (error?.code === 'INVALID_FEEDBACK') return res.status(400).json({ error: error.code, message: error.message });
      throw error;
    }
  }),
);

export default router;
