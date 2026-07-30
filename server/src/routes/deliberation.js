/**
 * 真 Agent 架构 Step 2: 推演状态机路由
 *
 * 挂载点: /api/deliberation
 * 路由:
 *   POST /start                - 发起推演 { question, userId }
 *   POST /:sessionId/answer    - 用户回答追问 { answers }
 *   POST /:sessionId/execute   - 执行智囊推演 { agentIds }
 *   POST /:sessionId/commit    - 提交抉择 { choice, feedback }
 *   GET  /:sessionId           - 读取当前状态
 *
 * 参考 agent.js 范式: Router + asyncHandler + optionalAuth
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 6.3 节
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { optionalAuth } from '../middleware/auth.js';
import * as deliberationEngine from '../services/deliberationEngine.js';

const router = Router();

/**
 * POST /api/deliberation/start
 * 发起推演：创建 session → Plan → 返回 { sessionId, state, plan, askUser }
 * body: { question, userId }
 */
router.post(
  '/start',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { question } = req.body || {};
    // userId 优先取 body，其次取 optionalAuth 注入的 req.userId
    const userId = req.body?.userId || req.userId;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '缺少 question 参数' });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }
    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' });
    }

    const result = await deliberationEngine.start(question, userId);
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/answer
 * 用户回答演的追问：重新 plan → 返回 { sessionId, state, plan }
 * body: { answers }
 */
router.post(
  '/:sessionId/answer',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { answers } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId 参数' });
    }

    const result = await deliberationEngine.answer(sessionId, answers || []);
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/execute
 * 执行智囊推演（Step 5 实现，当前占位）
 * body: { agentIds }
 */
router.post(
  '/:sessionId/execute',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { agentIds } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId 参数' });
    }

    const result = await deliberationEngine.execute(sessionId, agentIds || []);
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/commit
 * 提交抉择：固化记忆、生成命签（Step 6 实现，当前调 consolidate）
 * body: { choice, feedback }
 */
router.post(
  '/:sessionId/commit',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { choice, feedback } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId 参数' });
    }
    if (!choice) {
      return res.status(400).json({ error: '缺少 choice 参数' });
    }

    const result = await deliberationEngine.commit(sessionId, choice, feedback || '');
    res.json(result);
  })
);

/**
 * GET /api/deliberation/:sessionId
 * 读取当前推演状态
 */
router.get(
  '/:sessionId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId 参数' });
    }

    const session = await deliberationEngine.getState(sessionId);
    if (!session) {
      return res.status(404).json({ error: `会话不存在: ${sessionId}` });
    }

    res.json({ session });
  })
);

export default router;
