import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/admin.js';
import { requirePrincipal } from '../middleware/principal.js';
import { query } from '../services/db.js';
import { normalizeProductEvent } from '../services/productAnalytics.js';
import { loadFeedback, loadGeneralFeedback, loadProductEvents, normalizeOpsRange, updateFeedbackReview, updateGeneralFeedbackReview } from '../services/opsRepository.js';
import { buildOpsMetrics, projectRecentSessions } from '../services/opsMetrics.js';
import { getArtworkEntitlement, grantArtworkCredits } from '../services/artworkEntitlementService.js';
import { buildInfrastructureStatus } from '../services/infrastructureStatusService.js';
import { getOpsUsageSummary } from '../services/llmUsageService.js';
import { listCommunityReports, updateCommunityReport } from '../services/communityReportService.js';

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

router.get('/public-feedback', asyncHandler(async (req, res) => {
  const range = normalizeOpsRange(req.query);
  const feedback = await loadGeneralFeedback(range);
  await audit(req, 'public_feedback');
  res.json({ generatedAt: new Date().toISOString(), ...range, total: feedback.length, feedback });
}));

router.get('/infrastructure', asyncHandler(async (req, res) => {
  await audit(req, 'infrastructure');
  res.json({ infrastructure: buildInfrastructureStatus() });
}));

router.get('/costs', asyncHandler(async (req, res) => {
  const range = normalizeOpsRange(req.query);
  const costs = await getOpsUsageSummary(range);
  await audit(req, 'costs');
  res.json({ generatedAt: new Date().toISOString(), ...costs });
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

router.patch('/public-feedback/:id', asyncHandler(async (req, res) => {
  const reviewStatus = ['unread', 'read', 'resolved'].includes(req.body?.reviewStatus) ? req.body.reviewStatus : null;
  const internalNote = String(req.body?.internalNote || '').trim();
  if (!reviewStatus || internalNote.length > 500) return res.status(400).json({ error: 'INVALID_REVIEW' });
  const feedback = await updateGeneralFeedbackReview(req.params.id, { review_status: reviewStatus, internal_note: internalNote });
  if (!feedback) return res.status(404).json({ error: 'FEEDBACK_NOT_FOUND' });
  await audit(req, 'public_feedback_review');
  res.json({ feedback });
}));

router.get('/community-reports', asyncHandler(async (req, res) => {
  const status = String(req.query?.status || '').trim();
  const reports = await listCommunityReports({ status });
  await audit(req, 'community_reports');
  res.json({ generatedAt: new Date().toISOString(), total: reports.length, reports });
}));

router.patch('/community-reports/:id', asyncHandler(async (req, res) => {
  try {
    const report = await updateCommunityReport(req.params.id, {
      status: req.body?.status,
      internalNote: req.body?.internalNote,
      reviewerUserId: req.principal.userId,
    });
    await audit(req, 'community_report_review', { reportId: report.id, status: report.status });
    return res.json({ report });
  } catch (error) {
    const status = error?.code === 'REPORT_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ error: error?.code || 'REPORT_REVIEW_FAILED' });
  }
}));

router.get('/entitlements/:userId', asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const users = await query({ table: 'users', action: 'select', filter: { id: userId }, queryOptions: { limit: 1 } });
  if (!users.rows[0]) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  await audit(req, 'entitlement_lookup', { targetUserId: userId });
  return res.json({ user: { id: userId, email: users.rows[0].email || null, nickname: users.rows[0].nickname || null }, entitlement: await getArtworkEntitlement(userId) });
}));

router.post('/entitlements/:userId/grants', asyncHandler(async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const users = await query({ table: 'users', action: 'select', filter: { id: userId }, queryOptions: { limit: 1 } });
  if (!users.rows[0] || users.rows[0].anonymous) return res.status(404).json({ error: 'REGISTERED_USER_NOT_FOUND' });
  const reason = String(req.body?.reason || '').trim().slice(0, 120);
  if (!reason) return res.status(400).json({ error: 'GRANT_REASON_REQUIRED' });
  const idempotencyKey = String(req.body?.idempotencyKey || '').trim().slice(0, 100);
  try {
    const entitlement = await grantArtworkCredits({
      userId,
      amount: req.body?.amount,
      idempotencyKey,
      reason,
      actorId: req.principal.userId,
    });
    await audit(req, 'entitlement_grant', { targetUserId: userId, amount: Number(req.body?.amount), reason });
    return res.status(entitlement.idempotentReplay ? 200 : 201).json({ entitlement });
  } catch (error) {
    return res.status(400).json({ error: error.code || 'ENTITLEMENT_GRANT_FAILED' });
  }
}));

export default router;
