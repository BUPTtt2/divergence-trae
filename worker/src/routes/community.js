/**
 * 社区路由
 * - 前置 optionalAuth（公开读 + 登录写）
 * - 帖子 / 回复 / 点赞 / 已分享命签
 */

import { Hono } from 'hono';
import { optionalAuth, authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, parsePagination, audit } from '../utils/id.js';

const app = new Hono();

// 全部路由可选鉴权（公开读，登录写）
app.use('*', optionalAuth);

// ============================================================
// 帖子列表 / 详情
// ============================================================

// GET /posts — 公开，分页 + tag 筛选 + hot/new 排序
// hot = likes + replies_count * 2
app.get('/posts', async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const tag = c.req.query('tag');
    const sort = c.req.query('sort') === 'hot' ? 'hot' : 'new';

    const where = tag ? 'WHERE p.tag = ?' : 'WHERE 1=1';
    const params = tag ? [tag] : [];

    const orderBy =
      sort === 'hot'
        ? 'ORDER BY (p.likes + p.replies_count * 2) DESC, p.created_at DESC'
        : 'ORDER BY p.created_at DESC';

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM community_posts p ${where}`
    )
      .bind(...params)
      .first();

    const list = await c.env.DB.prepare(
      `SELECT p.id, p.title, p.content, p.tag, p.trigram, p.gua, p.card_id,
              p.likes, p.replies_count, p.pinned, p.created_at,
              u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_posts p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`
    )
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

// GET /posts/:id — 公开，帖子详情
app.get('/posts/:id', async (c) => {
  try {
    const post = await c.env.DB.prepare(
      `SELECT p.*, u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_posts p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    )
      .bind(c.req.param('id'))
      .first();

    if (!post) throw errors.notFound('帖子不存在');

    // 当前用户是否已点赞
    let liked = false;
    const userId = c.get('userId');
    if (userId) {
      const row = await c.env.DB.prepare(
        'SELECT 1 FROM community_likes WHERE post_id = ? AND user_id = ?'
      )
        .bind(post.id, userId)
        .first();
      liked = !!row;
    }

    return c.json({ ...post, liked });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 帖子创建 / 删除
// ============================================================

// POST /posts — 创建帖子
app.post('/posts', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { title, content, tag, trigram, gua, cardId } = body;

    if (!title || !content) throw errors.badRequest('title 与 content 必填');
    if (typeof title !== 'string' || title.length > 200)
      throw errors.badRequest('title 长度需在 200 字以内');

    // 取用户快照信息
    const user = await c.env.DB.prepare(
      'SELECT nickname, avatar, color FROM users WHERE id = ?'
    )
      .bind(userId)
      .first();

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO community_posts
       (id, user_id, user_name, user_avatar, user_color, title, content, tag, trigram, gua, card_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        userId,
        user?.nickname || null,
        user?.avatar || null,
        user?.color || null,
        title,
        content,
        tag || null,
        trigram || null,
        gua || null,
        cardId || null
      )
      .run();

    await audit(c, 'community_post_create', 'community_post', id);

    return c.json({ id, message: '帖子已发布' }, 201);
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// DELETE /posts/:id — 仅本人，级联删除回复/点赞
app.delete('/posts/:id', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const postId = c.req.param('id');

    const post = await c.env.DB.prepare(
      'SELECT user_id FROM community_posts WHERE id = ?'
    )
      .bind(postId)
      .first();

    if (!post) throw errors.notFound('帖子不存在');
    if (post.user_id !== userId) throw errors.forbidden('只能删除自己的帖子');

    // 级联删除（D1 batch 事务）
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM community_replies WHERE post_id = ?').bind(postId),
      c.env.DB.prepare('DELETE FROM community_likes WHERE post_id = ?').bind(postId),
      c.env.DB.prepare('DELETE FROM community_posts WHERE id = ?').bind(postId),
    ]);

    await audit(c, 'community_post_delete', 'community_post', postId);

    return c.json({ success: true });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 回复
// ============================================================

// GET /posts/:id/replies — 公开，回复列表
app.get('/posts/:id/replies', async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);
    const postId = c.req.param('id');

    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM community_replies WHERE post_id = ?'
    )
      .bind(postId)
      .first();

    const list = await c.env.DB.prepare(
      `SELECT r.*, u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM community_replies r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC
       LIMIT ? OFFSET ?`
    )
      .bind(postId, pageSize, offset)
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

// POST /posts/:id/replies — 回复帖子，replies_count += 1
app.post('/posts/:id/replies', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const postId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { content } = body;

    if (!content || typeof content !== 'string')
      throw errors.badRequest('content 必填');

    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    )
      .bind(postId)
      .first();
    if (!post) throw errors.notFound('帖子不存在');

    const user = await c.env.DB.prepare(
      'SELECT nickname, avatar, color FROM users WHERE id = ?'
    )
      .bind(userId)
      .first();

    const id = uuid();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO community_replies
         (id, post_id, user_id, user_name, user_avatar, user_color, content)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        postId,
        userId,
        user?.nickname || null,
        user?.avatar || null,
        user?.color || null,
        content
      ),
      c.env.DB.prepare(
        'UPDATE community_posts SET replies_count = replies_count + 1, updated_at = ? WHERE id = ?'
      ).bind(now(), postId),
    ]);

    return c.json({ id, message: '回复成功' }, 201);
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 点赞 / 取消点赞
// ============================================================

// POST /posts/:id/like — 点赞（UNIQUE 防重复）
app.post('/posts/:id/like', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const postId = c.req.param('id');

    const post = await c.env.DB.prepare(
      'SELECT id FROM community_posts WHERE id = ?'
    )
      .bind(postId)
      .first();
    if (!post) throw errors.notFound('帖子不存在');

    const id = uuid();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          'INSERT INTO community_likes (id, post_id, user_id) VALUES (?, ?, ?)'
        ).bind(id, postId, userId),
        c.env.DB.prepare(
          'UPDATE community_posts SET likes = likes + 1, updated_at = ? WHERE id = ?'
        ).bind(now(), postId),
      ]);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        throw errors.conflict('已点赞过该帖子');
      }
      throw e;
    }

    return c.json({ success: true, liked: true });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// DELETE /posts/:id/like — 取消点赞
app.delete('/posts/:id/like', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const postId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT id FROM community_likes WHERE post_id = ? AND user_id = ?'
    )
      .bind(postId, userId)
      .first();
    if (!existing) throw errors.notFound('未点赞过该帖子');

    await c.env.DB.batch([
      c.env.DB.prepare(
        'DELETE FROM community_likes WHERE post_id = ? AND user_id = ?'
      ).bind(postId, userId),
      c.env.DB.prepare(
        'UPDATE community_posts SET likes = MAX(likes - 1, 0), updated_at = ? WHERE id = ?'
      ).bind(now(), postId),
    ]);

    return c.json({ success: true, liked: false });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// 已分享命签列表
// ============================================================

// GET /shares — 公开，已分享命签
app.get('/shares', async (c) => {
  try {
    const { page, pageSize, offset } = parsePagination(c);

    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM cards WHERE is_shared = 1'
    ).first();

    const list = await c.env.DB.prepare(
      `SELECT c.id, c.gua, c.trigram, c.element, c.title, c.question, c.decision,
              c.verse, c.summary, c.rarity, c.style, c.created_at,
              u.nickname AS user_name, u.avatar AS user_avatar, u.color AS user_color
       FROM cards c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.is_shared = 1
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(pageSize, offset)
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

export default app;
