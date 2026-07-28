/**
 * 埋点数据接收与聚合路由
 * - POST /api/track        接收前端批量埋点（存内存数组）
 * - GET  /api/track/metrics 返回聚合指标（首签完成率/LLM成功率/分享率/回访率）
 * - GET  /api/track/events   返回最近 N 条原始事件（调试用）
 * - POST /api/track/error    前端关键错误上报
 *
 * 存储策略：内存数组（最多 5000 条，溢出丢弃最旧），单实例部署够用
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { recordLLMResult } from '../middleware/errorMonitor.js';

const router = Router();

const MAX_EVENTS = 5000;
const events = []; // 内存事件存储

/**
 * 记录一条事件到内存
 */
function pushEvent(event) {
  if (!event || !event.event) return;
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  // 同步给错误监控（用于 LLM 错误率告警）
  if (event.event === 'llm_result') {
    recordLLMResult(event.properties);
  }
}

/**
 * POST /api/track
 * body: { events: [{ event, userId, sessionId, timestamp, properties }] }
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { events: batch } = req.body || {};
    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ error: '缺少 events 数组' });
    }
    // 限制单批大小
    const safe = batch.slice(0, 100);
    for (const e of safe) {
      pushEvent(e);
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
  asyncHandler(async (req, res) => {
    const { message, stack, phase } = req.body || {};
    if (!message) return res.status(400).json({ error: '缺少 message' });
    pushEvent({
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
    });
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
  asyncHandler(async (req, res) => {
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
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const eventFilter = req.query.event;
    let result = events;
    if (eventFilter) {
      result = events.filter((e) => e.event === eventFilter);
    }
    res.json({
      events: result.slice(-limit).reverse(),
      total: events.length,
    });
  })
);

export default router;
