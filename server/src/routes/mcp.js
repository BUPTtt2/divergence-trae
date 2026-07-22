import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import { listTools, callTool } from '../services/mcpService.js';

const router = Router();

router.get(
  '/tools',
  requireUser,
  asyncHandler(async (req, res) => {
    const tools = listTools();
    res.json({ tools, total: tools.length });
  })
);

router.post(
  '/call',
  requireUser,
  asyncHandler(async (req, res) => {
    const { tool, params } = req.body;

    if (!tool) {
      return res.status(400).json({ error: '缺少 tool 参数' });
    }

    try {
      const result = await callTool(tool, params || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message, tool });
    }
  })
);

export default router;
