/**
 * 决策回访路由
 * - 全部需要 authMiddleware
 * - 跟踪用户重要决策的实际结局，作为模型反馈与个人成长记录
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, today, parsePagination, audit } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

// ============================================================
// GET / — 当前用户回访列表（按 status 筛选）
// ============================================================

app.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const { page, pageSize, offset } = parsePagination(c);
    const status = c.req.query('status'); // pending | done | all

    let sql = 'SELECT * FROM decision_follow_ups WHERE user_id = ?';
    const params = [userId];
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM (${sql})`
    )
      .bind(...params)
      .first();

    sql += ' ORDER BY follow_up_date DESC LIMIT ? OFFSET ?';
    const list = await c.env.DB.prepare(sql)
      .bind(...params, pageSize, offset)
      .all();

    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST / — 创建回访
// ============================================================

app.post('/', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { cardId, question, decision, daysLater } = body;

    if (!question || !decision)
      throw errors.badRequest('question 与 decision 必填');
    if (!Number.isInteger(daysLater) || daysLater < 0 || daysLater > 365)
      throw errors.badRequest('daysLater 必须为 0-365 的整数');

    const followUpDate = addDays(today(), daysLater);
    const id = uuid();

    await c.env.DB.prepare(
      `INSERT INTO decision_follow_ups
       (id, user_id, card_id, question, decision, follow_up_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    )
      .bind(id, userId, cardId || null, question, decision, followUpDate)
      .run();

    // 写日历事件
    await c.env.DB.prepare(
      `INSERT INTO calendar_events (id, user_id, date, type, ref_id, title)
       VALUES (?, ?, ?, 'followup', ?, ?)`
    )
      .bind(uuid(), userId, followUpDate, id, `决策回访 · ${question.slice(0, 20)}`)
      .run()
      .catch(() => {});

    await audit(c, 'followup_create', 'decision_follow_up', id);

    return c.json(
      { id, followUpDate, message: '回访已创建' },
      201
    );
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /:id — 单个回访详情
// ============================================================

app.get('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const item = await c.env.DB.prepare(
      'SELECT * FROM decision_follow_ups WHERE id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first();
    if (!item) throw errors.notFound('回访不存在');

    return c.json(item);
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// PUT /:id — 完成回访
// ============================================================

app.put('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { result, actualOutcome, rating } = body;

    if (!result) throw errors.badRequest('result 必填');
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
      throw errors.badRequest('rating 必须为 1-5 的整数');

    const existing = await c.env.DB.prepare(
      'SELECT user_id, status FROM decision_follow_ups WHERE id = ?'
    )
      .bind(id)
      .first();
    if (!existing) throw errors.notFound('回访不存在');
    if (existing.user_id !== userId) throw errors.forbidden('只能修改自己的回访');
    if (existing.status === 'done')
      throw errors.conflict('回访已完成，不可重复');

    await c.env.DB.prepare(
      `UPDATE decision_follow_ups
       SET status = 'done', result_note = ?, actual_outcome = ?, rating = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        result,
        actualOutcome || null,
        rating || null,
        now(),
        id
      )
      .run();

    await audit(c, 'followup_complete', 'decision_follow_up', id, { rating });

    // 完成回访自动加 XP（前端可调用 /level/xp，这里也内置一份）
    try {
      await c.env.DB.prepare(
        'UPDATE users SET xp = xp + 25, updated_at = ? WHERE id = ?'
      )
        .bind(now(), userId)
        .run();
    } catch {}

    return c.json({
      success: true,
      xpGained: 25,
      message: '回访已完成，+25 XP',
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// DELETE /:id — 删除回访（仅本人）
// ============================================================

app.delete('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT user_id FROM decision_follow_ups WHERE id = ?'
    )
      .bind(id)
      .first();
    if (!existing) throw errors.notFound('回访不存在');
    if (existing.user_id !== userId) throw errors.forbidden('只能删除自己的回访');

    await c.env.DB.batch([
      c.env.DB.prepare(
        'DELETE FROM calendar_events WHERE ref_id = ? AND type = ?'
      ).bind(id, 'followup'),
      c.env.DB.prepare('DELETE FROM decision_follow_ups WHERE id = ?').bind(id),
    ]);

    return c.json({ success: true });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /due — 已到期但未完成的回访
// ============================================================

app.get('/due', async (c) => {
  try {
    const userId = c.get('userId');
    const date = today();

    const list = await c.env.DB.prepare(
      `SELECT * FROM decision_follow_ups
       WHERE user_id = ? AND status = 'pending' AND follow_up_date <= ?
       ORDER BY follow_up_date ASC
       LIMIT 100`
    )
      .bind(userId, date)
      .all();

    return c.json({ items: list.results, total: list.results.length, today: date });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// 工具
// ============================================================

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export default app;
