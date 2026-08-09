import { Router } from 'express';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

const POSTS_TABLE = 'community_posts';
const REPLIES_TABLE = 'community_replies';
const LIKES_TABLE = 'community_likes';

// 输入长度限制
const MAX_TITLE = 100;
const MAX_CONTENT = 2000;

/**
 * GET /api/community/posts
 * 获取社区帖子列表
 * query: { sort: 'hot'|'new', tag?, limit?, offset? }
 */
router.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const { sort = 'hot', tag, limit = 20, offset = 0 } = req.query;
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const off = parseInt(offset, 10) || 0;

    const filter = {};
    if (tag) filter.tag = tag;

    // 内存模式直接用查询接口
    const result = await query({
      table: POSTS_TABLE,
      action: 'select',
      filter,
      queryOptions: {
        orderBy: sort === 'new' ? 'created_at:desc' : 'likes:desc',
        limit: lim + off,
      },
    });

    let posts = result.rows;
    // 内存模式手动分页
    posts = posts.slice(off, off + lim);

    // 尝试获取回复数
    const postsWithCounts = await Promise.all(
      posts.map(async (p) => {
        const repliesResult = await query({
          table: REPLIES_TABLE,
          action: 'select',
          filter: { post_id: p.id },
        });
        return {
          ...p,
          replies: typeof p.replies === 'number' ? p.replies : repliesResult.rowCount,
        };
      })
    );

    res.json({
      posts: postsWithCounts,
      total: result.rowCount,
      sort,
      tag: tag || null,
    });
  })
);

/**
 * POST /api/community/posts
 * 发布帖子
 * body: { title, content, tag, userId, trigram? }
 */
router.post(
  '/posts',
  requireUser,
  asyncHandler(async (req, res) => {
    const { title, content, tag = '综合', trigram = '☰' } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '缺少 title 或 content' });
    }
    if (title.length > MAX_TITLE) {
      return res.status(400).json({ error: `标题超过最大长度 ${MAX_TITLE}` });
    }
    if (content.length > MAX_CONTENT) {
      return res.status(400).json({ error: `内容超过最大长度 ${MAX_CONTENT}` });
    }

    const post = {
      id: generateUUID(),
      title: title.slice(0, MAX_TITLE),
      content: content.slice(0, MAX_CONTENT),
      tag: (tag || '综合').slice(0, 30),
      trigram: (trigram || '☰').slice(0, 10),
      user_id: req.userId,
      user_name: (req.body.userName || '匿名').slice(0, 30),
      likes: 0,
      created_at: new Date().toISOString(),
    };

    const result = await query({
      table: POSTS_TABLE,
      action: 'insert',
      data: post,
    });

    res.status(201).json({ post: result.rows[0] });
  })
);

/**
 * POST /api/community/posts/:id/replies
 * 回复帖子
 * body: { content, userId, userName }
 */
router.post(
  '/posts/:id/replies',
  requireUser,
  asyncHandler(async (req, res) => {
    const { content } = req.body;
    const postId = req.params.id;

    if (!content) {
      return res.status(400).json({ error: '缺少 content' });
    }
    if (content.length > MAX_CONTENT) {
      return res.status(400).json({ error: `回复内容超过最大长度 ${MAX_CONTENT}` });
    }

    // 检查帖子是否存在
    const postResult = await query({
      table: POSTS_TABLE,
      action: 'select',
      filter: { id: postId },
    });
    if (postResult.rowCount === 0) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    const reply = {
      id: generateUUID(),
      post_id: postId,
      content: content.slice(0, MAX_CONTENT),
      user_id: req.userId,
      user_name: (req.body.userName || '匿名').slice(0, 30),
      created_at: new Date().toISOString(),
    };

    const result = await query({
      table: REPLIES_TABLE,
      action: 'insert',
      data: reply,
    });

    res.status(201).json({ reply: result.rows[0] });
  })
);

/**
 * GET /api/community/posts/:id/replies
 * 获取帖子的回复
 */
router.get(
  '/posts/:id/replies',
  asyncHandler(async (req, res) => {
    const result = await query({
      table: REPLIES_TABLE,
      action: 'select',
      filter: { post_id: req.params.id },
      queryOptions: { orderBy: 'created_at:asc' },
    });
    res.json({ replies: result.rows, total: result.rowCount });
  })
);

/**
 * POST /api/community/posts/:id/like
 * 点赞帖子
 * body: { userId }
 */
router.post(
  '/posts/:id/like',
  requireUser,
  asyncHandler(async (req, res) => {
    const postId = req.params.id;
    const userId = req.userId;

    // 检查帖子是否存在
    const postResult = await query({
      table: POSTS_TABLE,
      action: 'select',
      filter: { id: postId },
    });
    if (postResult.rowCount === 0) {
      return res.status(404).json({ error: '帖子不存在' });
    }

    const post = postResult.rows[0];

    // 检查是否已点赞
    const existingLike = await query({
      table: LIKES_TABLE,
      action: 'select',
      filter: { post_id: postId, user_id: userId },
    });

    if (existingLike.rowCount > 0) {
      // 取消点赞
      await query({
        table: LIKES_TABLE,
        action: 'delete',
        id: existingLike.rows[0].id,
      });
      await query({
        table: POSTS_TABLE,
        action: 'update',
        id: postId,
        data: { likes: Math.max(0, (post.likes || 0) - 1) },
      });
      res.json({ liked: false, likes: Math.max(0, (post.likes || 0) - 1) });
    } else {
      // 点赞
      await query({
        table: LIKES_TABLE,
        action: 'insert',
        data: {
          id: generateUUID(),
          post_id: postId,
          user_id: userId,
          created_at: new Date().toISOString(),
        },
      });
      const updated = await query({
        table: POSTS_TABLE,
        action: 'update',
        id: postId,
        data: { likes: (post.likes || 0) + 1 },
      });
      res.json({ liked: true, likes: (post.likes || 0) + 1, post: updated.rows[0] });
    }
  })
);

export default router;
