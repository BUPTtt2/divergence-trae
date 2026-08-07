/**
 * 真 Agent 架构 Step 2: 推演状态机路由
 *
 * 挂载点: /api/deliberation
 *
 * 路由顺序（⚠️ 顺序决定匹配）：
 *   第一组 · 固定字路由（不会被 sessionId 吃掉）
 *     GET  /health
 *     GET  /memories
 *     GET  /advisors
 *     POST /advisors
 *     PUT  /advisors/:id
 *     DELETE /advisors/:id
 *     POST /start
 *   第二组 · 带 /:sessionId/events 前缀（action 固定）
 *     GET  /:sessionId/events
 *   第三组 · 带 /:sessionId/:action 的二参数动作
 *     POST /:sessionId/answer
 *     POST /:sessionId/execute
 *     POST /:sessionId/commit
 *     POST /:sessionId/pause
 *     POST /:sessionId/resume
 *     POST /:sessionId/snapshot
 *     GET  /:sessionId/resume        （注意：是 GET 恢复快照，与上面 pause/resume 不同语义）
 *   第四组 · 兜底 GET /:sessionId 读状态（黑名单过滤保留字）
 *
 * 参考 agent.js 范式: Router + asyncHandler；业务路由统一要求 verified principal
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 6.3 节
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireOwnedDeliberation, requirePrincipal } from '../middleware/principal.js';
import * as deliberationEngine from '../services/deliberationEngine.js';
import * as memoryService from '../services/memoryService.js';
import * as customAdvisorService from '../services/customAdvisorService.js';
import eventBus from '../services/eventBus.js';
import {
  normalizeExecuteResponse,
  parseExecuteRequest,
} from '../../../shared/deliberationContract.js';

const router = Router();

// 固定路由保留字（不可被当作 sessionId 匹配）
const RESERVED_KEYWORDS = new Set([
  'health', 'start', 'memories', 'advisors',
  'answer', 'execute', 'commit', 'pause', 'resume',
  'snapshot', 'events',
]);

function isReservedSegment(seg) {
  return typeof seg === 'string' && RESERVED_KEYWORDS.has(seg.toLowerCase());
}

/* ============================================================
 * 第一组 · 固定字路由（无 :sessionId 参数）
 * ============================================================ */

/**
 * GET /api/deliberation/health
 * 健康检查（也可用 /health，但这里再暴露一份方便 fallback 探活）
 */
router.get('/health', asyncHandler(async (req, res) => {
  res.json({
    status: 'ok',
    service: 'yance-bagua-engine',
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/deliberation/memories?userId=xxx
 * 获取用户命格列表（L3 长期记忆）
 */
router.get(
  '/memories',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const memories = await memoryService.listMemories(req.principal.userId, 10);
    res.json({ memories });
  })
);

/**
 * GET /api/deliberation/advisors?userId=xxx
 * 获取用户铸造的智囊列表（custom_advisors 快照智囊池）
 */
router.get(
  '/advisors',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const advisors = await customAdvisorService.listAdvisors(req.principal.userId);
    res.json({ advisors });
  })
);

/**
 * POST /api/deliberation/advisors
 * 创建铸造智囊
 * body: { name, persona, perspective, style, element, trigram, userId }
 */
router.post(
  '/advisors',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const advisor = await customAdvisorService.createAdvisor(req.principal.userId, req.body || {});
    res.json(advisor);
  })
);

/**
 * PUT /api/deliberation/advisors/:id
 * 更新铸造智囊
 * body: { name?, persona?, perspective?, style?, element?, trigram?, userId }
 */
router.put(
  '/advisors/:id',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const advisor = await customAdvisorService.updateAdvisor(id, req.principal.userId, req.body || {});
    if (!advisor) {
      return res.status(404).json({ error: '智囊不存在或无权修改' });
    }
    res.json(advisor);
  })
);

/**
 * DELETE /api/deliberation/advisors/:id
 * 删除铸造智囊
 * body: { userId }
 */
router.delete(
  '/advisors/:id',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ok = await customAdvisorService.deleteAdvisor(id, req.principal.userId);
    if (!ok) {
      return res.status(404).json({ error: '智囊不存在或无权删除' });
    }
    res.json({ ok: true });
  })
);

/**
 * POST /api/deliberation/start
 * 发起推演：创建 session → Plan → 返回 { sessionId, state, plan, askUser }
 * body: { question, userId }
 */
router.post(
  '/start',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { question } = req.body || {};

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '缺少 question 参数' });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }
    const result = await deliberationEngine.start(question, req.principal.userId);
    res.json(result);
  })
);

/* ============================================================
 * 第二组 · SSE 事件流
 * ============================================================ */

/**
 * GET /api/deliberation/:sessionId/events
 * SSE 端点 — 前端订阅推演事件流
 */
router.get('/:sessionId/events', requirePrincipal, requireOwnedDeliberation, async (req, res, next) => {
  const { sessionId } = req.params;
  if (isReservedSegment(sessionId)) { return next('route'); }
  if (!sessionId) {
    return res.status(400).json({ error: '缺少 sessionId 参数' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 发送初始连接确认
  const requestedCursor = req.get('Last-Event-ID') || req.query.afterSequence || '0';
  const afterSequence = /^\d+$/.test(String(requestedCursor)) ? Number(requestedCursor) : 0;
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', sessionId, afterSequence, timestamp: new Date().toISOString() })}\n\n`);

  try {
    await eventBus.subscribe(sessionId, res, { afterSequence });
  } catch {
    // subscribe 失败通常只是回放历史失败，但连接继续可用
  }

  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch {}
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    try { eventBus.unsubscribe(sessionId, res); } catch {}
  });
});

/* ============================================================
 * 第三组 · :sessionId 的动作路由（两个 path segment）
 * ============================================================ */

/**
 * GET /api/deliberation/:sessionId/clarify
 * 读取当前 session 的澄清追问（clarify 已存在于 session.state.clarify 或 plan 结果）
 * - 如果有 clarifyRound/clarifyQueue -> 返回当前轮未答完的 questions
 * - 否则返回 { needClarify: false }
 */
router.get(
  '/:sessionId/clarify',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const session = await deliberationEngine.getState(sessionId, { userId: req.principal.userId });
    if (!session) return res.status(404).json({ error: `会话不存在: ${sessionId}` });

    const st = session.state || {};
    let questions = [];
    let dimensions = [];
    let round = 1;
    let maxRound = 2;
    let openingLine = '';

    // 1) session 里保存的当前轮 clarifyQueue（由 _planWithClarify 写入）
    if (Array.isArray(st.clarifyQueue) && st.clarifyQueue.length > 0) {
      questions = st.clarifyQueue.map(q => (typeof q === 'string' ? { question: q, reason: '' } : q));
      round = st.clarifyRound || 1;
      maxRound = st.clarifyMaxRound || 2;
      openingLine = st.clarifyOpening || '';
      if (Array.isArray(st.clarifyDimensions)) dimensions = st.clarifyDimensions;
    }
    // 2) inference.clarify（旧 API：前端 /start 返回 inference.clarify.questions）
    else if (session.inference?.clarify && Array.isArray(session.inference.clarify.questions)) {
      questions = session.inference.clarify.questions.map(q => (typeof q === 'string' ? { question: q, reason: '' } : q));
      round = session.inference.clarify.round || 1;
      maxRound = session.inference.clarify.maxRound || 2;
      openingLine = session.inference.clarify.openingLine || '';
      if (Array.isArray(session.inference.clarify.dimensions)) dimensions = session.inference.clarify.dimensions;
    }

    res.json({
      needClarify: questions.length > 0,
      questions,
      round,
      maxRound,
      openingLine,
      dimensions,
      answered: Array.isArray(st.clarifyAnswers) ? st.clarifyAnswers.length : 0,
    });
  })
);

/**
 * POST /api/deliberation/:sessionId/answer
 * 用户回答演的追问：重新 plan
 */
router.post(
  '/:sessionId/answer',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const { answers } = req.body || {};
    const result = await deliberationEngine.answer(sessionId, answers || [], {
      userId: req.principal.userId,
    });
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/execute
 * 执行智囊推演
 */
router.post(
  '/:sessionId/execute',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    let command;
    try {
      command = parseExecuteRequest(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const result = await deliberationEngine.execute(sessionId, command.agentIds, {
      actionId: command.actionId,
      userId: req.userId || null,
    });
    res.json(normalizeExecuteResponse(result));
  })
);

/**
 * POST /api/deliberation/:sessionId/commit
 * 提交抉择：固化记忆、生成命签
 */
router.post(
  '/:sessionId/commit',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const { choice, feedback, actionId } = req.body || {};
    if (!choice) return res.status(400).json({ error: '缺少 choice 参数' });
    const result = await deliberationEngine.commit(sessionId, choice, feedback || '', {
      userId: req.principal.userId,
      actionId,
    });
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/pause
 * 暂停推演
 */
router.post(
  '/:sessionId/pause',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const { reason } = req.body || {};
    const result = await deliberationEngine.pause(sessionId, reason || 'user_paused', {
      userId: req.principal.userId,
    });
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/resume
 * 恢复推演（状态机语义：从 PAUSED 重新进入 WAIT_AGENT）
 */
router.post(
  '/:sessionId/resume',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const result = await deliberationEngine.resume(sessionId, { userId: req.principal.userId });
    if (result.state === 'FAILED') {
      return res.status(410).json({ error: result.reason || '暂停超时', ...result });
    }
    res.json(result);
  })
);

/**
 * POST /api/deliberation/:sessionId/snapshot
 * 保存前端推演状态（用户跳转铸造台前调用）
 */
router.post(
  '/:sessionId/snapshot',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const { phase, inference, activeAgents, selectedAgentIds, agentDialogues } = req.body || {};
    const session = await deliberationEngine.getState(sessionId, { userId: req.principal.userId });
    if (!session) return res.status(404).json({ error: `会话不存在: ${sessionId}` });
    session.snapshot = {
      phase,
      inference,
      activeAgents,
      selectedAgentIds: selectedAgentIds ? Array.from(selectedAgentIds) : [],
      agentDialogues,
      savedAt: new Date().toISOString(),
    };
    res.json({ ok: true, savedAt: session.snapshot.savedAt });
  })
);

/**
 * GET /api/deliberation/:sessionId/resume
 * 恢复前端推演状态（用户从铸造台返回时调用）
 * ⚠️ 这是 GET 语义：读 snapshot 字段，与 POST /:sessionId/resume（状态机恢复）完全不同
 */
router.get(
  '/:sessionId/resume',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;
    if (isReservedSegment(sessionId)) { return next('route'); }
    if (!sessionId) return res.status(400).json({ error: '缺少 sessionId 参数' });
    const session = await deliberationEngine.getState(sessionId, { userId: req.principal.userId });
    if (!session) return res.status(404).json({ error: `会话不存在: ${sessionId}` });
    if (session.snapshot) {
      res.json({ snapshot: session.snapshot, session });
    } else {
      res.json({ snapshot: null, session, message: '无快照，返回当前session状态' });
    }
  })
);

/* ============================================================
 * 第四组 · 兜底 GET /:sessionId 读状态
 * ============================================================ */

/**
 * GET /api/deliberation/:sessionId
 * 读取当前推演状态
 */
router.get(
  '/:sessionId',
  requirePrincipal,
  requireOwnedDeliberation,
  asyncHandler(async (req, res, next) => {
    const { sessionId } = req.params;

    // 保留字：让给后续可能的 404 或其他路由
    if (isReservedSegment(sessionId)) {
      return next('route');
    }
    if (!sessionId) {
      return res.status(400).json({ error: '缺少 sessionId 参数' });
    }

    const session = await deliberationEngine.getState(sessionId, { userId: req.principal.userId });
    if (!session) {
      return res.status(404).json({ error: `会话不存在: ${sessionId}` });
    }

    res.json({ session });
  })
);

export default router;
