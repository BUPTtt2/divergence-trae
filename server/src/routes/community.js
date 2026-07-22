import { Router } from 'express';
import { query } from '../services/db.js';
import { generateUUID, generateAnonymousId } from '../utils/id.js';
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

    // 数据库为空时返回预设精华帖子（符合演策风格）
    if (result.rowCount === 0 && !tag) {
      return res.json({
        posts: SEED_POSTS,
        total: SEED_POSTS.length,
        sort,
        tag: null,
        seeded: true,
      });
    }

    res.json({
      posts: postsWithCounts,
      total: result.rowCount,
      sort,
      tag: tag || null,
    });
  })
);

/* 预设精华帖子 - 演策社区初始内容 */
const SEED_POSTS = [
  {
    id: 'seed-1',
    title: '演策初体验：用乾卦决了辞职创业的心',
    content: '困在原点三个月，演策给我召了钱谷、风眼、镜渊三位顾问。风眼一句"风从虎，云从龙，你怕的不是风浪是码头"直接点醒。乾卦九五飞龙在天，下了。三周后回来看，不悔。',
    tag: '真实推演',
    trigram: '☰',
    user_id: 'seed-user-1',
    user_name: '已飞龙',
    likes: 47,
    replies: 8,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'seed-2',
    title: '坎卦投资记：止损比抄底更需要勇气',
    content: '问"该不该补仓"，得坎卦习坎。镜渊说"入险再入险，不是勇敢是执念"。果断止损，两周后回头看，避开了20%的下跌。演策不是算命，是帮你看见自己不愿意看见的那一面。',
    tag: '投资决策',
    trigram: '☵',
    user_id: 'seed-user-2',
    user_name: '坎中行人',
    likes: 35,
    replies: 5,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'seed-3',
    title: '问感情的都得兑卦？三次了',
    content: '连续三次问感情都是兑卦。兑为泽，为悦，为口舌。心禾顾问说"兑卦不是让你分，是让你开口说——你憋着的那句话才是病根"。当晚摊牌，居然没吵。留个帖记录。',
    tag: '感情',
    trigram: '☱',
    user_id: 'seed-user-3',
    user_name: '泽畔',
    likes: 28,
    replies: 12,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'seed-4',
    title: '【解卦日记】艮卦止的不是行，是心',
    content: '问"该不该接受调岗"，得艮卦。艮其背，不获其身。法度顾问的解读很妙：艮卦止的不是你的行动，是你心里那股"非如此不可"的劲。调岗不是退，是换个山头。已接受。',
    tag: '职场',
    trigram: '☶',
    user_id: 'seed-user-4',
    user_name: '艮山',
    likes: 22,
    replies: 4,
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
  },
];

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
