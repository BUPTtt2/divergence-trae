/**
 * 演对话相关 API
 */
import { Router } from 'express';
import { chatWithYan, streamChatWithYan, getDailyGua } from '../services/yanChatService.js';
import { getRecentMessages, retrieveMemories, getUserProfile } from '../services/memoryService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { llmRateLimit } from '../middleware/rateLimit.js';
import { requireUser, optionalAuth, publicAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/yan/chat
 * 与演对话（非流式）
 * body: { message, conversationId?, history? }
 */
router.post(
  '/chat',
  publicAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { message, conversationId, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '缺少 message 参数' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: '消息过长，请控制在4000字以内' });
    }

    if (!req.userId) {
      const mockReply = `我听到了你说的，但听到的只是表层。\n请允许我问三点：\n一、这件事最坏的结果，你能否承受？\n二、三年后回看今天，你希望自己已经做了什么？\n三、你此刻最怕的不是失败，而是什么？\n回答之前不必急，先静坐片刻。`;
      return res.json({
        message: mockReply,
        conversationId: conversationId || 'anonymous-' + Date.now(),
        hasUserId: false,
      });
    }

    const result = await chatWithYan(req.userId, message, conversationId);
    res.json({ ...result, hasUserId: true });
  })
);

/**
 * POST /api/yan/chat/stream
 * 与演对话（SSE 流式）
 * body: { message, conversationId?, history? }
 */
router.post(
  '/chat/stream',
  publicAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { message, conversationId, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '缺少 message 参数' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: '消息过长' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (!req.userId) {
      const mockReply = `我听到了你说的，但听到的只是表层。\n请允许我问三点：\n一、这件事最坏的结果，你能否承受？\n二、三年后回看今天，你希望自己已经做了什么？\n三、你此刻最怕的不是失败，而是什么？\n回答之前不必急，先静坐片刻。`;
      
      res.write(`data: ${JSON.stringify({ type: 'meta', conversationId: conversationId || 'anonymous-' + Date.now(), hasUserId: false })}\n\n`);
      
      const CHUNK = 8;
      for (let i = 0; i < mockReply.length; i += CHUNK) {
        const chunk = mockReply.slice(i, i + CHUNK);
        res.write(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`);
      }
      
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      if (typeof res.end === 'function') res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ type: 'meta', conversationId, hasUserId: true })}\n\n`);

    try {
      for await (const chunk of streamChatWithYan(req.userId, message, conversationId)) {
        res.write(`data: ${chunk}\n\n`);
        if (!res.writable) break;
      }
    } catch (e) {
      console.error('[yan] 流式对话错误:', e.message);
      res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    } finally {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      if (typeof res.end === 'function') res.end();
    }
  })
);

/**
 * GET /api/yan/messages?conversationId=xxx
 * 获取对话历史
 */
router.get(
  '/messages',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.json({ messages: [] });
    }
    const { conversationId } = req.query;
    if (!conversationId) {
      return res.status(400).json({ error: '缺少 conversationId' });
    }
    const messages = await getRecentMessages(conversationId, 50);
    res.json({ messages });
  })
);

/**
 * GET /api/yan/memories
 * 获取用户记忆列表
 */
router.get(
  '/memories',
  publicAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      return res.json({ memories: [], profile: {} });
    }
    const { query: q, limit = 20 } = req.query;
    const memories = await retrieveMemories(req.userId, q || '', parseInt(limit, 10) || 20);
    const profile = await getUserProfile(req.userId);
    res.json({ memories, profile });
  })
);

/**
 * GET /api/yan/daily
 * 获取今日卦象箴言
 */
router.get(
  '/daily',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.userId) {
      const today = new Date().toISOString().split('T')[0];
      const guas = ['乾', '坤', '屯', '蒙', '需', '讼', '师', '比'];
      const g = guas[Math.floor(Math.random() * guas.length)];
      return res.json({ date: today, gua: g, message: `演今日观你之气，恰合「${g}」卦。不必问吉凶，先问自己是否已准备好承接。` });
    }
    const today = new Date().toISOString().split('T')[0];
    const daily = await getDailyGua(req.userId, today);
    res.json(daily || {});
  })
);

export default router;
