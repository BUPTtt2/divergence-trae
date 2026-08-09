/**
 * 埋点数据接收与聚合路由
 * - POST /api/track        接收前端批量埋点（持久化）
 * - GET  /api/track/metrics 返回聚合指标（首签完成率/LLM成功率/分享率/回访率）
 * - GET  /api/track/events   返回最近 N 条原始事件（调试用）
 * - POST /api/track/error    前端关键错误上报
 *
 * 存储策略：PostgreSQL / 内存 DB adapter，同一签名用户隔离。
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recordLLMResult } from '../middleware/errorMonitor.js';
import { requirePrincipal } from '../middleware/principal.js';
import { query } from '../services/db.js';
import { generateUUID } from '../utils/id.js';

const router = Router();

async function pushEvent(event, userId) {
  if (!event || !event.event) return null;
  const normalized = {
    id: generateUUID(),
    user_id: userId,
    session_id: String(event.sessionId || '').slice(0, 120) || null,
    event_name: String(event.event).slice(0, 80),
    properties: event.properties && typeof event.properties === 'object' ? event.properties : {},
    occurred_at: new Date(Number(event.timestamp) || Date.now()).toISOString(),
  };
  await query({ table: 'product_events', action: 'insert', data: normalized });
  // 同步给错误监控（用于 LLM 错误率告警）
  if (event.event === 'llm_result') {
    recordLLMResult(normalized.properties);
  }
  return normalized;
}

/**
 * POST /api/track
 * body: { events: [{ event, userId, sessionId, timestamp, properties }] }
 */
router.post(
  '/',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { events: batch } = req.body || {};
    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ error: '缺少 events 数组' });
    }
    // 限制单批大小
    const safe = batch.slice(0, 100);
    for (const e of safe) {
      await pushEvent(e, req.principal.userId);
    }
    res.json({ received: safe.length });
  })
);

/**
 * POST /api/track/error
 * 前端关键错误上报
 * body: { message, stack?, phase?, userId? }
 */
router.post(
  '/error',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const { message, stack, phase } = req.body || {};
    if (!message) return res.status(400).json({ error: '缺少 message' });
    await pushEvent({
      event: 'error',
      userId: req.body.userId || 'unknown',
      sessionId: req.body.sessionId || 'unknown',
      timestamp: Date.now(),
      properties: {
        message: String(message).slice(0, 500),
        stack: stack ? String(stack).slice(0, 1000) : undefined,
        phase: phase ? String(phase) : undefined,
        source: 'frontend',
      },
    }, req.principal.userId);
    res.json({ received: 1 });
  })
);

/**
 * GET /api/track/metrics
 * 返回聚合指标：
 * - firstSignCompletion: 首签完成率 = phase_enter(final) / phase_enter(input)
 * - llmSuccessRate: LLM 成功率 = llm_result(success=true) / llm_call
 * - shareRate: 分享率 = share / phase_enter(path_reveal)
 * - revisitRate: 回访回填率 = revisit(withOutcome) / phase_enter(final) 30天前
 */
router.get(
  '/metrics',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const stored = await query({
      table: 'product_events',
      action: 'select',
      filter: { user_id: req.principal.userId },
      queryOptions: { orderBy: 'occurred_at:desc', limit: 5000 },
    });
    const events = (stored.rows || []).map((row) => ({
      event: row.event_name,
      timestamp: new Date(row.occurred_at).getTime(),
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties || '{}') : (row.properties || {}),
    }));
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - THIRTY_DAYS_MS;

    let phaseEnterInput = 0;
    let phaseEnterFinal = 0;
    let phaseEnterPathReveal = 0;
    let llmCall = 0;
    let llmSuccess = 0;
    let share = 0;
    let revisitWithOutcome = 0;
    let phaseEnterFinal30DaysAgo = 0;

    for (const e of events) {
      if (e.event === 'phase_enter') {
        const phase = e.properties?.phase;
        if (phase === 'input') phaseEnterInput++;
        if (phase === 'final') {
          phaseEnterFinal++;
          if (e.timestamp < thirtyDaysAgo) phaseEnterFinal30DaysAgo++;
        }
        if (phase === 'path_reveal') phaseEnterPathReveal++;
      } else if (e.event === 'llm_call') {
        llmCall++;
      } else if (e.event === 'llm_result') {
        if (e.properties?.success) llmSuccess++;
      } else if (e.event === 'share') {
        share++;
      } else if (e.event === 'revisit' && e.properties?.withOutcome) {
        revisitWithOutcome++;
      }
    }

    res.json({
      firstSignCompletion: phaseEnterInput > 0 ? phaseEnterFinal / phaseEnterInput : 0,
      llmSuccessRate: llmCall > 0 ? llmSuccess / llmCall : 0,
      shareRate: phaseEnterPathReveal > 0 ? share / phaseEnterPathReveal : 0,
      revisitRate: phaseEnterFinal30DaysAgo > 0 ? revisitWithOutcome / phaseEnterFinal30DaysAgo : 0,
      counts: {
        phaseEnterInput,
        phaseEnterFinal,
        phaseEnterPathReveal,
        llmCall,
        llmSuccess,
        share,
        revisitWithOutcome,
        totalEvents: events.length,
      },
      generatedAt: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/track/events
 * 查询最近 N 条原始事件（调试用）
 * query: ?limit=100&event=phase_enter
 */
router.get(
  '/events',
  requirePrincipal,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const eventFilter = req.query.event;
    const stored = await query({
      table: 'product_events',
      action: 'select',
      filter: { user_id: req.principal.userId },
      queryOptions: { orderBy: 'occurred_at:desc', limit },
    });
    let result = (stored.rows || []).map((row) => ({
      id: row.id,
      event: row.event_name,
      userId: row.user_id,
      sessionId: row.session_id,
      timestamp: new Date(row.occurred_at).getTime(),
      properties: typeof row.properties === 'string' ? JSON.parse(row.properties || '{}') : (row.properties || {}),
    }));
    if (eventFilter) {
      result = result.filter((e) => e.event === eventFilter);
    }
    res.json({
      events: result.slice(0, limit),
      total: result.length,
    });
  })
);

export default router;
