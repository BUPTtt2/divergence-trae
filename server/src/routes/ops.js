import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/admin.js';
import { requirePrincipal } from '../middleware/principal.js';
import { query } from '../services/db.js';
import { normalizeProductEvent } from '../services/productAnalytics.js';
import { loadFeedback, loadProductEvents, normalizeOpsRange, updateFeedbackReview } from '../services/opsRepository.js';
import { buildOpsMetrics, projectRecentSessions } from '../services/opsMetrics.js';

const router = Router();
router.use(requirePrincipal, requireAdmin);

async function audit(req, surface, properties = {}) {
  const event = normalizeProductEvent({ event: 'ops_accessed', properties: { surface, ...properties } }, { principalId: req.principal.userId });
  if (event) await query({ table: 'product_events', action: 'insert', data: event });
}

async function context(req) {
  const range = normalizeOpsRange(req.query);
  const [events, feedback] = await Promise.all([loadProductEvents(range), loadFeedback(range)]);
  return { range, events, feedback, metrics: buildOpsMetrics(events, feedback) };
}

router.get('/overview', asyncHandler(async (req, res) => {
  const data = await context(req);
  await audit(req, 'overview');
  res.json({ generatedAt: new Date().toISOString(), ...data.range, sampleSize: data.events.length, metrics: data.metrics });
}));

router.get('/funnel', asyncHandler(async (req, res) => {
  const data = await context(req);
  await audit(req, 'funnel');
  res.json({ generatedAt: new Date().toISOString(), ...data.range, sampleSize: data.events.length, funnel: data.metrics.funnel });
}));

router.get('/reliability', asyncHandler(async (req, res) => {
  const data = await context(req);
  await audit(req, 'reliability');
  res.json({ generatedAt: new Date().toISOString(), ...data.range, sampleSize: data.events.length, reliability: data.metrics.reliability, durationMs: data.metrics.durationMs, byRelease: data.metrics.byRelease });
}));

router.get('/sessions', asyncHandler(async (req, res) => {
  const range = normalizeOpsRange(req.query);
  const events = await loadProductEvents(range);
  await audit(req, 'sessions');
  res.json({ generatedAt: new Date().toISOString(), ...range, sampleSize: events.length, sessions: projectRecentSessions(events) });
}));

router.get('/feedback', asyncHandler(async (req, res) => {
  const range = normalizeOpsRange(req.query);
  const feedback = await loadFeedback(range);
  await audit(req, 'feedback');
  res.json({ generatedAt: new Date().toISOString(), ...range, total: feedback.length, feedback });
}));

router.patch('/feedback/:id', asyncHandler(async (req, res) => {
  const reviewStatus = ['unread', 'read', 'resolved'].includes(req.body?.reviewStatus) ? req.body.reviewStatus : null;
  const internalNote = String(req.body?.internalNote || '').trim();
  if (!reviewStatus || internalNote.length > 500) return res.status(400).json({ error: 'INVALID_REVIEW' });
  const feedback = await updateFeedbackReview(req.params.id, { review_status: reviewStatus, internal_note: internalNote });
  if (!feedback) return res.status(404).json({ error: 'FEEDBACK_NOT_FOUND' });
  await audit(req, 'feedback_review');
  res.json({ feedback });
}));

export default router;
