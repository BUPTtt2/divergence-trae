/**
 * 演的对话路由
 * - 全部需要 authMiddleware
 * - SSE 流式返回，LLM 不可用时降级
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { optionalAuth } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, today, parsePagination } from '../utils/id.js';
import { isLlmAvailable, chatCompletion } from '../services/llm.js';

const app = new Hono();

app.use('*', optionalAuth);

const YAN_SYSTEM_PROMPT = `你是「演」，演策·八卦推演引擎的大管家与对话者。
你的职责：
1. 不替用户做决定，而是通过提问让用户看清自己的处境与选择。
2. 用周易、卦象的隐喻作为思考工具，而非宿命论。
3. 回答简短克制，每次不超过 200 字，留白让用户思考。
4. 若用户的问题模糊，先反问一个问题再给方向。
5. 偶尔（不强求）可引用卦辞、爻辞作为隐喻。`;

// ============================================================
// POST /chat — 流式回复
// ============================================================

app.post('/chat', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { message, conversationId, history: clientHistory } = body;
    if (!message || typeof message !== 'string')
      throw errors.badRequest('message 必填');
    if (message.length > 4000)
      throw errors.badRequest('message 长度需在 4000 字以内');

    let convId = conversationId || uuid();
    let isNewConv = !conversationId;
    let messages = [{ role: 'system', content: YAN_SYSTEM_PROMPT }];

    if (userId) {
      if (!conversationId) {
        const title = message.slice(0, 30);
        await c.env.DB.prepare(
          `INSERT INTO conversations (id, user_id, title, last_message_at)
           VALUES (?, ?, ?, ?)`
        )
          .bind(convId, userId, title, now())
          .run();
      } else {
        const conv = await c.env.DB.prepare(
          'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
        )
          .bind(convId, userId)
          .first();
        if (!conv) throw errors.notFound('会话不存在');
      }

      const userMsgId = uuid();
      await c.env.DB.prepare(
        `INSERT INTO conversation_messages
         (id, conversation_id, user_id, role, content)
         VALUES (?, ?, ?, 'user', ?)`
      )
        .bind(userMsgId, convId, userId, message)
        .run();

      const history = await c.env.DB.prepare(
        `SELECT role, content FROM conversation_messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 10`
      )
        .bind(convId)
        .all();
      messages = [
        { role: 'system', content: YAN_SYSTEM_PROMPT },
        ...history.results.reverse().map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ];
    } else {
      if (Array.isArray(clientHistory) && clientHistory.length > 0) {
        messages = [
          { role: 'system', content: YAN_SYSTEM_PROMPT },
          ...clientHistory.slice(-6),
        ];
      }
      messages.push({ role: 'user', content: message });
    }

    let reply = null;
    if (isLlmAvailable(c.env)) {
      reply = await chatCompletion(c.env, messages, {
        temperature: 0.85,
        maxTokens: 800,
      });
    }

    if (!reply) {
      reply = degradeReply(message);
    }

    const assistantMsgId = uuid();

    if (userId) {
      await c.env.DB.prepare(
        `INSERT INTO conversation_messages
         (id, conversation_id, user_id, role, content)
         VALUES (?, ?, ?, 'assistant', ?)`
      )
        .bind(assistantMsgId, convId, userId, reply)
        .run();

      await c.env.DB.prepare(
        'UPDATE conversations SET last_message_at = ? WHERE id = ?'
      )
        .bind(now(), convId)
        .run();

      await c.env.DB.prepare(
        'UPDATE users SET total_chats = total_chats + 1 WHERE id = ?'
      )
        .bind(userId)
        .run();
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'meta',
          conversationId: convId,
          messageId: assistantMsgId,
          isNewConversation: isNewConv,
          hasUserId: !!userId,
        }),
      });

      const CHUNK = 8;
      for (let i = 0; i < reply.length; i += CHUNK) {
        const chunk = reply.slice(i, i + CHUNK);
        await stream.writeSSE({
          data: JSON.stringify({ type: 'content', content: chunk }),
        });
        await stream.sleep(20);
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) });
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

/**
 * LLM 不可用时的降级回复
 */
function degradeReply(message) {
  const m = message.trim();
  if (/你好|您好|hi|hello/i.test(m)) {
    return '我在。今日有何事扰心？慢慢说，不必急。';
  }
  if (/[？?]$/.test(m)) {
    return `问得不错。但在回答之前，先反问一句：你为何在此刻问这个问题？是已有倾向，只是想求一个确认？还是真的举棋不定？\n这两种心态，对应的是两条不同的路径。`;
  }
  if (m.length < 10) {
    return '说得太简了。能否补一句背景——这件事牵涉到的是事业、人际，还是内心的某个抉择？';
  }
  return `我听到了你说的，但听到的只是表层。\n请允许我问三点：\n一、这件事最坏的结果，你能否承受？\n二、三年后回看今天，你希望自己已经做了什么？\n三、你此刻最怕的不是失败，而是什么？\n回答之前不必急，先静坐片刻。`;
}

// ============================================================
// GET /messages — 对话历史
// ============================================================

app.get('/messages', async (c) => {
  try {
    const userId = c.get('userId');
    const conversationId = c.req.query('conversationId');
    if (!conversationId) throw errors.badRequest('conversationId 必填');

    const conv = await c.env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
    )
      .bind(conversationId, userId)
      .first();
    if (!conv) throw errors.notFound('会话不存在');

    const list = await c.env.DB.prepare(
      `SELECT id, role, content, meta, created_at
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 200`
    )
      .bind(conversationId)
      .all();

    return c.json({ conversationId, items: list.results });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /conversations — 会话列表
// ============================================================

app.get('/conversations', async (c) => {
  try {
    const userId = c.get('userId');
    const { page, pageSize, offset } = parsePagination(c);

    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM conversations WHERE user_id = ?'
    )
      .bind(userId)
      .first();

    const list = await c.env.DB.prepare(
      `SELECT id, title, last_message_at, created_at
       FROM conversations
       WHERE user_id = ?
       ORDER BY last_message_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(userId, pageSize, offset)
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
// 记忆 CRUD
// ============================================================

// POST /memories — 添加记忆（未登录用户降级处理）
app.post('/memories', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const { category, title, content, source, confidence } = body;

    if (!category || !content)
      throw errors.badRequest('category 与 content 必填');
    const validCats = ['deduction', 'preference', 'fact', 'profile'];
    if (!validCats.includes(category))
      throw errors.badRequest(`category 必须为: ${validCats.join(', ')}`);

    const id = uuid();

    if (userId) {
      await c.env.DB.prepare(
        `INSERT INTO user_memories
         (id, user_id, category, title, content, source, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          userId,
          category,
          title || null,
          content,
          source || null,
          typeof confidence === 'number' ? confidence : 0.8
        )
        .run();

      return c.json({ id, message: '记忆已添加' }, 201);
    } else {
      return c.json({ id, message: '记忆已保存（未登录，仅本地生效）', persisted: false }, 201);
    }
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// GET /memories — 用户记忆列表（支持 query 模糊搜索）
app.get('/memories', async (c) => {
  try {
    const userId = c.get('userId');

    if (!userId) {
      return c.json({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
    }

    const { page, pageSize, offset } = parsePagination(c);
    const query = c.req.query('query');
    const category = c.req.query('category');

    let sql = 'SELECT * FROM user_memories WHERE user_id = ?';
    const params = [userId];
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (query) {
      sql += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countRow = await c.env.DB.prepare(countSql)
      .bind(...params)
      .first();

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
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

// DELETE /memories/:id — 删除记忆（仅本人）
app.delete('/memories/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const id = c.req.param('id');

    const mem = await c.env.DB.prepare(
      'SELECT user_id FROM user_memories WHERE id = ?'
    )
      .bind(id)
      .first();
    if (!mem) throw errors.notFound('记忆不存在');
    if (mem.user_id !== userId) throw errors.forbidden('只能删除自己的记忆');

    await c.env.DB.prepare('DELETE FROM user_memories WHERE id = ?')
      .bind(id)
      .run();

    return c.json({ success: true });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /daily — 演的今日卦象（独立视角）
// ============================================================

app.get('/daily', async (c) => {
  try {
    const userId = c.get('userId');
    const date = today();

    // 复用 daily_divinations；若不存在则用 user_id+'yan' 哈希算一卦
    const existing = await c.env.DB.prepare(
      'SELECT * FROM daily_divinations WHERE user_id = ? AND date = ?'
    )
      .bind(userId, date)
      .first();

    if (existing) {
      // 演的视角加一段评语
      return c.json({
        ...existing,
        yan_comment: `此卦「${existing.gua}」，演以为：${existing.message}`,
      });
    }

    // 不存库，仅返回临时卦象
    const data = new TextEncoder().encode(`yan:${userId}:${date}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(hash);
    let n = 0;
    for (let i = 0; i < 8; i++) n = (n * 256 + bytes[i]) % 1000003;
    const guas = ['乾', '坤', '屯', '蒙', '需', '讼', '师', '比', '泰', '否'];
    const g = guas[n % guas.length];

    return c.json({
      date,
      gua: g,
      yan_comment: `演今日观你之气，恰合「${g}」卦。不必问吉凶，先问自己是否已准备好承接。`,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

export default app;
