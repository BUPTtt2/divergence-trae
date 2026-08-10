import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import { listTools } from '../services/mcpService.js';
import { executeEvidenceTool } from '../services/toolEvidenceGateway.js';

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
      const result = await executeEvidenceTool(tool, params || {}, { actorId: req.userId });
      const status = result.ok ? 200 : (result.status === 'approval_required' ? 409 : 422);
      res.status(status).json(result);
    } catch (e) {
      res.status(400).json({ error: e.message, tool });
    }
  })
);

export default router;
