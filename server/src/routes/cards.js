import { Router } from 'express';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import { requirePrincipal } from '../middleware/principal.js';
import { normalizeCardReplay, replayColumns, requireAppendOnlyReplay } from '../services/cardReplayService.js';

const router = Router();

const TABLE = 'cards';

// 输入长度限制
const MAX_LEN = {
  title: 100,
  question: 500,
  decision: 500,
  summary: 1000,
  verse: 200,
  gua: 20,
  trigram: 10,
  element: 20,
  rarity: 20,
  style: 50,
  powerful_question: 500,
  framework: 200,
};

function validateLength(obj, fields) {
  for (const [field, max] of Object.entries(fields)) {
    if (obj[field] && typeof obj[field] === 'string' && obj[field].length > max) {
      return `字段 ${field} 超过最大长度 ${max}`;
    }
  }
  return null;
}

/**
 * GET /api/cards
 * 获取天命牌列表
 * query: { userId?, limit? }
 */
router.get(
  '/',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;
    const result = await query({
      table: TABLE,
      action: 'select',
      filter: { user_id: req.principal.userId },
      queryOptions: { orderBy: 'created_at:desc', limit: parseInt(limit, 10) || 50 },
    });
    res.json({ cards: result.rows, total: result.rowCount });
  })
);

/**
 * GET /api/cards/:id
 * 获取单个天命牌
 */
router.get(
  '/:id',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const result = await query({
      table: TABLE,
      action: 'select',
      filter: { id: req.params.id, user_id: req.principal.userId },
    });
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '卡牌不存在' });
    }
    res.json({ card: result.rows[0] });
  })
);

/**
 * POST /api/cards
 * 创建天命牌
 * body: { userId, gua, trigram, element, title, question, decision, verse, summary, advisors?, rarity?, style?, pillars? }
 */
router.post(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    const lenErr = validateLength(req.body, MAX_LEN);
    if (lenErr) return res.status(400).json({ error: lenErr });
    let replay;
    try {
      replay = normalizeCardReplay(req.body.replay, { required: req.body.replay !== undefined });
    } catch (error) {
      return res.status(400).json({ error: error.message, errorCode: error.code || 'INVALID_REPLAY' });
    }
    const sourceSessionId = typeof req.body.sessionId === 'string'
      ? req.body.sessionId.trim().slice(0, 120)
      : '';
    if (sourceSessionId) {
      const existing = await query({
        table: TABLE,
        action: 'select',
        filter: { user_id: req.userId, source_session_id: sourceSessionId },
        queryOptions: { limit: 1 },
      });
      if (existing.rows[0]) {
        return res.status(200).json({ card: existing.rows[0], idempotentReplay: true });
      }
    }

    const card = {
      id: generateUUID(),
      user_id: req.userId,
      gua: (req.body.gua || '').slice(0, MAX_LEN.gua),
      trigram: (req.body.trigram || '').slice(0, MAX_LEN.trigram),
      element: (req.body.element || '').slice(0, MAX_LEN.element),
      title: (req.body.title || '').slice(0, MAX_LEN.title),
      question: (req.body.question || '').slice(0, MAX_LEN.question),
      decision: (req.body.decision || '').slice(0, MAX_LEN.decision),
      verse: (req.body.verse || '').slice(0, MAX_LEN.verse),
      summary: (req.body.summary || '').slice(0, MAX_LEN.summary),
      advisors: JSON.stringify(req.body.advisors || []),
      rarity: (req.body.rarity || 'common').slice(0, MAX_LEN.rarity),
      style: (req.body.style || '').slice(0, MAX_LEN.style),
      pillars: JSON.stringify(req.body.pillars || {}),
      powerful_question: (req.body.powerfulQuestion || '').slice(0, MAX_LEN.powerful_question),
      framework: (req.body.framework || '').slice(0, MAX_LEN.framework),
      source_session_id: sourceSessionId || null,
      reversal_conditions: JSON.stringify(req.body.reversalConditions || []),
      next_actions: JSON.stringify(req.body.nextActions || []),
      evidence: JSON.stringify(req.body.evidence || []),
      artwork: JSON.stringify(req.body.artwork || {}),
      ...replayColumns(replay),
      created_at: new Date().toISOString(),
    };

    const result = await query({
      table: TABLE,
      action: 'insert',
      data: card,
    });

    res.status(201).json({ card: result.rows[0] });
  })
);

/**
 * PUT /api/cards/:id
 * 更新天命牌
 */
router.put(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    // 所有权校验
    const existing = await query({ table: TABLE, action: 'select', filter: { id: req.params.id } });
    if (existing.rowCount === 0) return res.status(404).json({ error: '卡牌不存在' });
    if (existing.rows[0].user_id !== req.userId) return res.status(403).json({ error: '无权修改他人卡牌' });

    const lenErr = validateLength(req.body, MAX_LEN);
    if (lenErr) return res.status(400).json({ error: lenErr });

    const updates = {};
    const allowedFields = [
      'gua', 'trigram', 'element', 'title', 'question', 'decision',
      'verse', 'summary', 'rarity', 'style', 'powerful_question', 'framework',
    ];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (req.body.advisors) updates.advisors = JSON.stringify(req.body.advisors);
    if (req.body.pillars) updates.pillars = JSON.stringify(req.body.pillars);
    if (req.body.artwork) updates.artwork = JSON.stringify(req.body.artwork);
    if (req.body.replay !== undefined) {
      try {
        Object.assign(updates, replayColumns(requireAppendOnlyReplay(existing.rows[0].replay, req.body.replay)));
      } catch (error) {
        const status = error.code === 'REPLAY_NOT_APPEND_ONLY' ? 409 : 400;
        return res.status(status).json({ error: error.message, errorCode: error.code || 'INVALID_REPLAY' });
      }
    }

    const result = await query({
      table: TABLE,
      action: 'update',
      id: req.params.id,
      data: updates,
    });

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '卡牌不存在' });
    }
    res.json({ card: result.rows[0] });
  })
);

/**
 * DELETE /api/cards/:id
 * 删除天命牌
 */
router.delete(
  '/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    // 所有权校验
    const existing = await query({ table: TABLE, action: 'select', filter: { id: req.params.id } });
    if (existing.rowCount === 0) return res.status(404).json({ error: '卡牌不存在' });
    if (existing.rows[0].user_id !== req.userId) return res.status(403).json({ error: '无权删除他人卡牌' });

    const result = await query({
      table: TABLE,
      action: 'delete',
      id: req.params.id,
    });
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '卡牌不存在' });
    }
    res.json({ success: true, id: req.params.id });
  })
);

export default router;
