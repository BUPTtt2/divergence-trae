import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireOwnedDeliberation, requirePrincipal } from '../middleware/principal.js';
import { upsertFeedback } from '../services/feedbackService.js';

const router = Router();

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
