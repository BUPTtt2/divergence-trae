import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import { requirePrincipal } from '../middleware/principal.js';
import {
  listAdvisors,
  getAdvisor,
  createAdvisor,
  updateAdvisor,
  deleteAdvisor,
} from '../services/customAdvisorService.js';
import {
  listCatalog,
  publishOwnedAdvisor,
  subscribeAdvisor,
  unsubscribeAdvisor,
} from '../services/advisorCatalogService.js';

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
  '/catalog',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const assets = await listCatalog({
      userId: req.principal.userId,
      source: String(req.query.source || 'all'),
      query: String(req.query.query || ''),
      limit: req.query.limit,
    });
    res.json({ assets, total: assets.length, source: String(req.query.source || 'all') });
  })
);

router.post(
  '/market/:id/subscribe',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const result = await subscribeAdvisor({
      userId: req.principal.userId,
      publishedAdvisorId: req.params.id,
    });
    if (!result) return res.status(404).json({ error: '市集智囊不存在' });
    return res.status(result.created ? 201 : 200).json(result);
  })
);

router.delete(
  '/market/:id/subscribe',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const result = await unsubscribeAdvisor({
      userId: req.principal.userId,
      publishedAdvisorId: req.params.id,
    });
    res.json(result);
  })
);

router.post(
  '/:id/publish',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const result = await publishOwnedAdvisor({
      userId: req.principal.userId,
      advisorId: req.params.id,
    });
    if (!result) return res.status(404).json({ error: '智囊不存在或无权发布' });
    return res.status(result.created ? 201 : 200).json(result);
  })
);

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
      ...req.body,
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
