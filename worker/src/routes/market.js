/**
 * 智囊市集路由
 * - 公开读 + authMiddleware 写
 * - 订阅时复制一份到 custom_advisors（origin_market_id 关联）
 * - 评分更新 rating_sum / rating_count
 */

import { Hono } from 'hono';
import { optionalAuth, authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, parsePagination, audit } from '../utils/id.js';

const app = new Hono();

app.use('*', optionalAuth);

// ============================================================
// GET /agents — 公开，市集智囊列表
// ============================================================

app.get('/agents', async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const tag = c.req.query('tag');
    const trigram = c.req.query('trigram');

    let where = 'WHERE 1=1';
    const params = [];
    if (tag) {
      where += ' AND tags LIKE ?';
      params.push(`%"${tag}"%`);
    }
    if (trigram) {
      where += ' AND trigram = ?';
      params.push(trigram);
    }

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM agent_market ${where}`
    )
      .bind(...params)
      .first();

    const list = await c.env.DB.prepare(
      `SELECT id, author_id, author_name, name, persona, perspective, style,
              element, trigram, color, subscriber_count,
              rating_sum, rating_count, tags, created_at
       FROM agent_market
       ${where}
       ORDER BY subscriber_count DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...params, pageSize, offset)
      .all();

    // 计算平均评分
    const items = list.results.map((r) => ({
      ...r,
      tags: safeParse(r.tags, []),
      rating_avg:
        r.rating_count > 0 ? r.rating_sum / r.rating_count : 0,
    }));

    return c.json({
      items,
      total: countRow?.total || 0,
      page,
      pageSize,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /agents/:id — 公开，智囊详情
// ============================================================

app.get('/agents/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const agent = await c.env.DB.prepare(
      `SELECT id, author_id, author_name, name, persona, perspective, style,
              element, trigram, color, subscriber_count,
              rating_sum, rating_count, tags, created_at
       FROM agent_market WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!agent) throw errors.notFound('智囊不存在');

    // 当前用户是否已订阅
    let subscribed = false;
    const userId = c.get('userId');
    if (userId) {
      const row = await c.env.DB.prepare(
        'SELECT 1 FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?'
      )
        .bind(userId, id)
        .first();
      subscribed = !!row;
    }

    return c.json({
      ...agent,
      tags: safeParse(agent.tags, []),
      rating_avg:
        agent.rating_count > 0 ? agent.rating_sum / agent.rating_count : 0,
      subscribed,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /agents — 发布智囊到市集
// ============================================================

app.post('/agents', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { name, persona, perspective, style, element, trigram, color, tags } = body;

    if (!name || !persona || !perspective)
      throw errors.badRequest('name / persona / perspective 必填');
    if (name.length > 50) throw errors.badRequest('name 长度需在 50 字以内');

    const user = await c.env.DB.prepare(
      'SELECT nickname FROM users WHERE id = ?'
    )
      .bind(userId)
      .first();

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO agent_market
       (id, author_id, author_name, name, persona, perspective, style,
        element, trigram, color, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        userId,
        user?.nickname || null,
        name,
        persona,
        perspective,
        style || '周易古风',
        element || null,
        trigram || null,
        color || null,
        JSON.stringify(Array.isArray(tags) ? tags : [])
      )
      .run();

    await audit(c, 'market_publish', 'agent_market', id);

    return c.json({ id, message: '智囊已发布到市集' }, 201);
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 订阅 / 取消订阅
// ============================================================

// POST /agents/:id/subscribe — 订阅，复制一份到 custom_advisors
app.post('/agents/:id/subscribe', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const marketId = c.req.param('id');

    const agent = await c.env.DB.prepare(
      'SELECT * FROM agent_market WHERE id = ?'
    )
      .bind(marketId)
      .first();
    if (!agent) throw errors.notFound('智囊不存在');

    // 防重复订阅
    const existing = await c.env.DB.prepare(
      'SELECT id FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?'
    )
      .bind(userId, marketId)
      .first();
    if (existing) throw errors.conflict('已订阅该智囊');

    const subId = uuid();
    const advisorId = uuid();
    const ts = now();

    // 事务：写订阅 + 复制智囊副本 + 增加订阅数
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO market_subscriptions (id, user_id, market_agent_id) VALUES (?, ?, ?)`
      ).bind(subId, userId, marketId),
      c.env.DB.prepare(
        `INSERT INTO custom_advisors
         (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        advisorId,
        userId,
        agent.name,
        agent.persona,
        agent.perspective,
        agent.style || '周易古风',
        agent.element || null,
        agent.trigram || null,
        agent.color || null,
        marketId
      ),
      c.env.DB.prepare(
        `UPDATE agent_market SET subscriber_count = subscriber_count + 1 WHERE id = ?`
      ).bind(marketId),
    ]);

    await audit(c, 'market_subscribe', 'agent_market', marketId);

    return c.json({
      success: true,
      advisorId,
      subscriptionId: subId,
      message: '订阅成功，已添加到智囊库',
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// DELETE /agents/:id/subscribe — 取消订阅（不删除 custom_advisors 副本）
app.delete('/agents/:id/subscribe', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const marketId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT id FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?'
    )
      .bind(userId, marketId)
      .first();
    if (!existing) throw errors.notFound('未订阅该智囊');

    await c.env.DB.batch([
      c.env.DB.prepare(
        'DELETE FROM market_subscriptions WHERE user_id = ? AND market_agent_id = ?'
      ).bind(userId, marketId),
      c.env.DB.prepare(
        `UPDATE agent_market SET subscriber_count = MAX(subscriber_count - 1, 0) WHERE id = ?`
      ).bind(marketId),
    ]);

    return c.json({ success: true, message: '已取消订阅（智囊副本保留）' });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /agents/:id/rate — 评分（rating 1-5）
// ============================================================

app.post('/agents/:id/rate', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const marketId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { rating } = body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw errors.badRequest('rating 必须为 1-5 的整数');

    const agent = await c.env.DB.prepare(
      'SELECT id, rating_sum, rating_count FROM agent_market WHERE id = ?'
    )
      .bind(marketId)
      .first();
    if (!agent) throw errors.notFound('智囊不存在');

    // 写入反馈表，用于评分去重与统计（按 user+agent 唯一性靠应用层判断，简化处理）
    const fbId = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO agent_feedback (id, user_id, agent_id, feedback_type, feedback_text)
         VALUES (?, ?, ?, 'good', ?)`
      ).bind(fbId, userId, marketId, `rating=${rating}`),
      c.env.DB.prepare(
        `UPDATE agent_market
         SET rating_sum = rating_sum + ?, rating_count = rating_count + 1
         WHERE id = ?`
      ).bind(rating, marketId),
    ]);

    const newSum = agent.rating_sum + rating;
    const newCount = agent.rating_count + 1;

    return c.json({
      success: true,
      rating_avg: newSum / newCount,
      rating_count: newCount,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 工具
// ============================================================

function safeParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default app;
