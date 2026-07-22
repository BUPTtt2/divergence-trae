import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import {
  listAdvisors,
  getAdvisor,
  createAdvisor,
  updateAdvisor,
  deleteAdvisor,
} from '../services/customAdvisorService.js';

const router = Router();

const MAX_LEN = {
  name: 50,
  persona: 1000,
  perspective: 200,
  style: 50,
  element: 20,
  trigram: 10,
};

function validateLength(obj, fields) {
  for (const [field, max] of Object.entries(fields)) {
    if (obj[field] && typeof obj[field] === 'string' && obj[field].length > max) {
      return `字段 ${field} 超过最大长度 ${max}`;
    }
  }
  return null;
}

router.get(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    const advisors = await listAdvisors(req.userId);
    res.json({ advisors, total: advisors.length });
  })
);

router.get(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    const advisor = await getAdvisor(req.params.id, req.userId);
    if (!advisor) {
      return res.status(404).json({ error: '顾问不存在' });
    }
    res.json({ advisor });
  })
);

router.post(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    const { name, persona, perspective, style, element, trigram } = req.body;

    if (!name || !persona || !perspective) {
      return res.status(400).json({ error: '缺少必填字段：name, persona, perspective' });
    }

    const lenErr = validateLength(req.body, MAX_LEN);
    if (lenErr) return res.status(400).json({ error: lenErr });

    const advisor = await createAdvisor(req.userId, {
      name,
      persona,
      perspective,
      style,
      element,
      trigram,
    });

    res.status(201).json({ advisor });
  })
);

router.put(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    const lenErr = validateLength(req.body, MAX_LEN);
    if (lenErr) return res.status(400).json({ error: lenErr });

    const advisor = await updateAdvisor(req.params.id, req.userId, req.body);
    if (!advisor) {
      return res.status(404).json({ error: '顾问不存在' });
    }
    res.json({ advisor });
  })
);

router.delete(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    const success = await deleteAdvisor(req.params.id, req.userId);
    if (!success) {
      return res.status(404).json({ error: '顾问不存在' });
    }
    res.json({ success: true, id: req.params.id });
  })
);

export default router;
