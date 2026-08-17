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
import { aggregateProductAnalytics, normalizeProductEvent } from '../services/productAnalytics.js';

const router = Router();

async function pushEvent(event, userId) {
  const normalized = normalizeProductEvent({ ...event, timestamp: Date.now() }, { principalId: userId });
  if (!normalized) return null;
  if (normalized.deliberation_session_id) {
    const ownedSession = await query({
      table: 'deliberation_sessions',
      action: 'select',
      filter: { id: normalized.deliberation_session_id, user_id: userId },
      queryOptions: { limit: 1 },
    });
    if (!ownedSession.rows[0]) return null;
  }
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
    let received = 0;
    let rejected = Math.max(0, batch.length - safe.length);
    for (const event of safe) {
      const stored = await pushEvent(event, req.principal.userId);
      if (stored) received += 1;
      else rejected += 1;
    }
    res.json({ received, rejected });
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
    const { message, phase } = req.body || {};
    if (!message) return res.status(400).json({ error: '缺少 message' });
    await pushEvent({
      event: 'client_error',
      analyticsSessionId: req.body.analyticsSessionId,
      deliberationSessionId: req.body.deliberationSessionId,
      releaseId: req.body.releaseId,
      mode: req.body.mode,
      deviceClass: req.body.deviceClass,
      platformFamily: req.body.platformFamily,
      timestamp: Date.now(),
      properties: {
        errorCode: String(message).slice(0, 80),
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
    const rows = stored.rows || [];
    const analytics = aggregateProductAnalytics(rows);
    const eventRows = rows.map((row) => ({ event: row.event_name, properties: typeof row.properties === 'string' ? JSON.parse(row.properties || '{}') : (row.properties || {}) }));
    const phaseEnterInput = new Set(rows.filter((row) => {
      const properties = typeof row.properties === 'string' ? JSON.parse(row.properties || '{}') : (row.properties || {});
      return ['phase_enter', 'phase_entered'].includes(row.event_name) && properties.phase === 'input';
    }).map((row) => row.deliberation_session_id || row.session_id)).size;
    const phaseEnterFinal = analytics.completions;
    const phaseEnterPathReveal = new Set(rows.filter((row) => {
      const properties = typeof row.properties === 'string' ? JSON.parse(row.properties || '{}') : (row.properties || {});
      return ['phase_enter', 'phase_entered'].includes(row.event_name) && properties.phase === 'path_reveal';
    }).map((row) => row.deliberation_session_id || row.session_id)).size;
    const llmCall = eventRows.filter((event) => ['llm_call', 'llm_request_completed'].includes(event.event)).length;
    const llmSuccess = eventRows.filter((event) => ['llm_result', 'llm_request_completed'].includes(event.event) && event.properties.success === true).length;
    const share = eventRows.filter((event) => ['share', 'destiny_card_shared'].includes(event.event)).length;
    const revisitWithOutcome = eventRows.filter((event) => ['revisit', 'outcome_revisit_submitted'].includes(event.event) && event.properties.withOutcome).length;

    res.json({
      firstSignCompletion: phaseEnterInput > 0 ? phaseEnterFinal / phaseEnterInput : 0,
      llmSuccessRate: llmCall > 0 ? llmSuccess / llmCall : 0,
      shareRate: phaseEnterPathReveal > 0 ? share / phaseEnterPathReveal : 0,
      revisitRate: phaseEnterFinal > 0 ? revisitWithOutcome / phaseEnterFinal : 0,
      analytics,
      counts: {
        phaseEnterInput,
        phaseEnterFinal,
        phaseEnterPathReveal,
        llmCall,
        llmSuccess,
        share,
        revisitWithOutcome,
        totalEvents: rows.length,
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
      sessionId: row.deliberation_session_id || row.session_id,
      analyticsSessionId: row.analytics_session_id || null,
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
