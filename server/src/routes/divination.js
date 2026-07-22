import { Router } from 'express';
import { castHexagram, interpretHexagram } from '../services/yiJingEngine.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * POST /api/divination/cast
 * 调用 yiJingEngine.castHexagram 起卦
 * body: { question?: string }
 */
router.post(
  '/cast',
  asyncHandler(async (req, res) => {
    const { question = '' } = req.body;

    const result = castHexagram();

    res.json({
      question,
      original: result.original,
      changed: result.changed,
      changingLines: result.changingLines,
      lineText: result.lineText,
      tosses: result.tosses,
    });
  })
);

/**
 * POST /api/divination/interpret
 * 调用 yiJingEngine.interpretHexagram 解读卦象
 * body: { hexagram, question, agentDialogues }
 */
router.post(
  '/interpret',
  asyncHandler(async (req, res) => {
    const { hexagram, question = '', agentDialogues = [] } = req.body;

    if (!hexagram || !hexagram.original) {
      return res.status(400).json({ error: '缺少 hexagram 参数或 hexagram.original' });
    }

    const interpretation = await interpretHexagram(hexagram, question, agentDialogues);

    res.json({
      question,
      hexagram,
      interpretation,
    });
  })
);

export default router;
