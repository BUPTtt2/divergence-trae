/**
 * 命签 CRUD 路由（全部需要 authMiddleware）
 *
 * - GET    /                  当前用户命签列表（分页）
 * - GET    /:id                单个命签详情
 * - POST   /                  创建命签
 * - PUT    /:id                更新命签
 * - DELETE /:id                删除命签（仅本人）
 * - POST   /:id/share          公开命签到社区
 * - GET    /:id/notes          命签笔记列表
 * - POST   /:id/notes          添加笔记
 * - DELETE /:id/notes/:noteId   删除笔记
 *
 * 安全：所有 SQL 用 ? 占位符 + bind()；权限校验仅本人可操作。
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, parsePagination, safeJsonParse, safeJsonStringify, isValidUuid } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const createCardSchema = z.object({
  sessionId: z.string().optional(),
  gua: z.string().max(32).optional(),
  trigram: z.string().max(16).optional(),
  element: z.string().max(16).optional(),
  title: z.string().min(1).max(120),
  question: z.string().max(500).optional(),
  decision: z.string().max(500).optional(),
  verse: z.string().max(500).optional(),
  summary: z.string().max(2000).optional(),
  advisors: z.array(z.string()).optional(),
  rarity: z.string().max(32).optional(),
  style: z.string().max(32).optional(),
  pillars: z.string().max(2000).optional(),
  powerfulQuestion: z.string().max(500).optional(),
  framework: z.string().max(500).optional(),
});

const updateCardSchema = createCardSchema.partial();

const noteCreateSchema = z.object({
  content: z.string().min(1).max(1000),
});

/* ------------------------------------------------------------------ *
 * 公共
 * ------------------------------------------------------------------ */

function publicCard(c) {
  if (!c) return null;
  return {
    id: c.id,
    sessionId: c.session_id || null,
    gua: c.gua || null,
    trigram: c.trigram || null,
    element: c.element || null,
    title: c.title,
    question: c.question || null,
    decision: c.decision || null,
    verse: c.verse || null,
    summary: c.summary || null,
    advisors: safeJsonParse(c.advisors, []) || [],
    rarity: c.rarity || null,
    style: c.style || null,
    pillars: c.pillars || null,
    powerfulQuestion: c.powerful_question || null,
    framework: c.framework || null,
    isShared: c.is_shared === 1,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/**
 * 校验命签属于当前用户
 */
async function loadOwnedCard(c, cardId) {
  if (!isValidUuid(cardId)) throw errors.badRequest('命签 ID 格式不正确');
  const userId = c.get('userId');
  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(cardId, userId).first();
  if (!card) throw errors.notFound('命签不存在或无权访问');
  return card;
}

/* ------------------------------------------------------------------ *
 * GET / — 列表
 * ------------------------------------------------------------------ */

app.get('/', async (c) => {
  const userId = c.get('userId');
  const { page, pageSize, offset } = parsePagination(c);

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cards WHERE user_id = ?`
  ).bind(userId).first();

  const rows = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(userId, pageSize, offset).all();

  return c.json({
    cards: (rows.results || []).map(publicCard),
    pagination: { page, pageSize, total: total?.n || 0 },
  });
});

/* ------------------------------------------------------------------ *
 * GET /:id — 详情
 * ------------------------------------------------------------------ */

app.get('/:id', async (c) => {
  const card = await loadOwnedCard(c, c.req.param('id'));
  return c.json({ card: publicCard(card) });
});

/* ------------------------------------------------------------------ *
 * POST / — 创建
 * ------------------------------------------------------------------ */

app.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const data = parsed.data;
  const userId = c.get('userId');
  const id = uuid();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO cards
      (id, user_id, session_id, gua, trigram, element, title, question, decision,
       verse, summary, advisors, rarity, style, pillars, powerful_question, framework,
       is_shared, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    id,
    userId,
    data.sessionId || null,
    data.gua || null,
    data.trigram || null,
    data.element || null,
    data.title,
    data.question || null,
    data.decision || null,
    data.verse || null,
    data.summary || null,
    safeJsonStringify(data.advisors || []),
    data.rarity || null,
    data.style || null,
    data.pillars || null,
    data.powerfulQuestion || null,
    data.framework || null,
    nowIso,
    nowIso
  ).run();

  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? LIMIT 1`
  ).bind(id).first();

  return c.json({ card: publicCard(card) }, 201);
});

/* ------------------------------------------------------------------ *
 * PUT /:id — 更新
 * ------------------------------------------------------------------ */

app.put('/:id', async (c) => {
  const cardId = c.req.param('id');
  await loadOwnedCard(c, cardId);

  const body = await c.req.json().catch(() => null);
  const parsed = updateCardSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const data = parsed.data;

  // 字段映射：驼峰 → 数据库列
  const fieldMap = {
    sessionId: 'session_id',
    gua: 'gua',
    trigram: 'trigram',
    element: 'element',
    title: 'title',
    question: 'question',
    decision: 'decision',
    verse: 'verse',
    summary: 'summary',
    rarity: 'rarity',
    style: 'style',
    pillars: 'pillars',
    powerfulQuestion: 'powerful_question',
    framework: 'framework',
  };

  const sets = [];
  const values = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (k === 'advisors') {
      sets.push('advisors = ?');
      values.push(safeJsonStringify(v));
    } else if (fieldMap[k]) {
      sets.push(`${fieldMap[k]} = ?`);
      values.push(v);
    }
  }

  if (sets.length === 0) throw errors.badRequest('无可更新字段');
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(cardId);

  await c.env.DB.prepare(
    `UPDATE cards SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  const card = await c.env.DB.prepare(
    `SELECT * FROM cards WHERE id = ? LIMIT 1`
  ).bind(cardId).first();

  return c.json({ card: publicCard(card) });
});

/* ------------------------------------------------------------------ *
 * DELETE /:id — 删除
 * ------------------------------------------------------------------ */

app.delete('/:id', async (c) => {
  const cardId = c.req.param('id');
  await loadOwnedCard(c, cardId);
  const userId = c.get('userId');

  // 同时删除关联笔记
  const stmts = [
    c.env.DB.prepare(`DELETE FROM card_notes WHERE card_id = ?`).bind(cardId),
    c.env.DB.prepare(`DELETE FROM cards WHERE id = ? AND user_id = ?`).bind(cardId, userId),
  ];
  await c.env.DB.batch(stmts);

  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * POST /:id/share — 公开到社区
 * ------------------------------------------------------------------ */

app.post('/:id/share', async (c) => {
  const cardId = c.req.param('id');
  const card = await loadOwnedCard(c, cardId);
  const userId = c.get('userId');

  // 已公开则返回
  if (card.is_shared === 1) {
    return c.json({ ok: true, alreadyShared: true });
  }

  await c.env.DB.prepare(
    `UPDATE cards SET is_shared = 1, updated_at = ? WHERE id = ? AND user_id = ?`
  ).bind(new Date().toISOString(), cardId, userId).run();

  // 同步创建社区帖子（精简版）
  const postId = uuid();
  await c.env.DB.prepare(
    `INSERT INTO community_posts
      (id, user_id, user_name, user_avatar, user_color, title, content, tag, trigram, gua, card_id)
     SELECT ?, u.id, u.nickname, u.avatar, u.color, ?, ?, 'card_share', ?, ?, ?
     FROM users u WHERE u.id = ?`
  ).bind(
    postId,
    card.title,
    card.summary || card.question || '',
    card.trigram || null,
    card.gua || null,
    cardId,
    userId
  ).run().catch((e) => {
    console.warn('[cards] 同步社区帖子失败:', e.message);
  });

  return c.json({ ok: true, postId });
});

/* ------------------------------------------------------------------ *
 * GET /:id/notes — 笔记列表
 * ------------------------------------------------------------------ */

app.get('/:id/notes', async (c) => {
  const cardId = c.req.param('id');
  await loadOwnedCard(c, cardId);

  const rows = await c.env.DB.prepare(
    `SELECT * FROM card_notes WHERE card_id = ? ORDER BY created_at DESC`
  ).bind(cardId).all();

  const notes = (rows.results || []).map((n) => ({
    id: n.id,
    cardId: n.card_id,
    userId: n.user_id,
    content: n.content,
    createdAt: n.created_at,
  }));

  return c.json({ notes });
});

/* ------------------------------------------------------------------ *
 * POST /:id/notes — 添加笔记
 * ------------------------------------------------------------------ */

app.post('/:id/notes', async (c) => {
  const cardId = c.req.param('id');
  await loadOwnedCard(c, cardId);
  const userId = c.get('userId');

  const body = await c.req.json().catch(() => null);
  const parsed = noteCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { content } = parsed.data;

  const id = uuid();
  await c.env.DB.prepare(
    `INSERT INTO card_notes (id, card_id, user_id, content) VALUES (?, ?, ?, ?)`
  ).bind(id, cardId, userId, content).run();

  const note = await c.env.DB.prepare(
    `SELECT * FROM card_notes WHERE id = ? LIMIT 1`
  ).bind(id).first();

  return c.json({
    note: {
      id: note.id,
      cardId: note.card_id,
      userId: note.user_id,
      content: note.content,
      createdAt: note.created_at,
    },
  }, 201);
});

/* ------------------------------------------------------------------ *
 * DELETE /:id/notes/:noteId — 删除笔记
 * ------------------------------------------------------------------ */

app.delete('/:id/notes/:noteId', async (c) => {
  const cardId = c.req.param('id');
  const noteId = c.req.param('noteId');
  if (!isValidUuid(noteId)) throw errors.badRequest('笔记 ID 格式不正确');
  await loadOwnedCard(c, cardId);
  const userId = c.get('userId');

  const result = await c.env.DB.prepare(
    `DELETE FROM card_notes WHERE id = ? AND card_id = ? AND user_id = ?`
  ).bind(noteId, cardId, userId).run();

  if (!result.meta.changes) {
    throw errors.notFound('笔记不存在或无权删除');
  }

  return c.json({ ok: true });
});

export default app;
