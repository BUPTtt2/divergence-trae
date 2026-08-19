import { query } from './db.js';
import { generateUUID } from '../utils/id.js';

const REASONS = new Set(['spam', 'harassment', 'privacy', 'misinformation', 'self_harm', 'other']);
const STATUSES = new Set(['unread', 'reviewing', 'resolved', 'dismissed']);
const TARGET_TABLES = Object.freeze({ post: 'community_posts', reply: 'community_replies' });

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function createCommunityReport(input, options = {}) {
  const queryImpl = options.queryImpl || query;
  const targetType = String(input.targetType || '').trim();
  const targetId = String(input.targetId || '').trim();
  const reason = String(input.reason || '').trim();
  const details = String(input.details || '').trim();
  if (!TARGET_TABLES[targetType] || !targetId) throw codedError('INVALID_REPORT_TARGET');
  if (!REASONS.has(reason)) throw codedError('INVALID_REPORT_REASON');
  if (details.length > 500) throw codedError('REPORT_DETAILS_TOO_LONG');

  const target = await queryImpl({ table: TARGET_TABLES[targetType], action: 'select', filter: { id: targetId }, queryOptions: { limit: 1 } });
  if (!target.rows[0]) throw codedError('REPORT_TARGET_NOT_FOUND');
  const now = options.now ? options.now() : new Date().toISOString();
  const result = await queryImpl({
    table: 'community_reports',
    action: 'insert',
    data: {
      id: options.generateId ? options.generateId() : generateUUID(),
      reporter_user_id: input.reporterUserId,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
      status: 'unread',
      created_at: now,
      updated_at: now,
    },
  });
  return result.rows[0];
}

export async function listCommunityReports(options = {}) {
  const queryImpl = options.queryImpl || query;
  const filter = options.status && STATUSES.has(options.status) ? { status: options.status } : {};
  const result = await queryImpl({ table: 'community_reports', action: 'select', filter, queryOptions: { orderBy: 'created_at:desc', limit: 200 } });
  return result.rows;
}

export async function updateCommunityReport(reportId, input, options = {}) {
  const queryImpl = options.queryImpl || query;
  const status = String(input.status || '').trim();
  const internalNote = String(input.internalNote || '').trim();
  if (!STATUSES.has(status)) throw codedError('INVALID_REPORT_STATUS');
  if (internalNote.length > 500) throw codedError('REPORT_NOTE_TOO_LONG');
  const result = await queryImpl({
    table: 'community_reports',
    action: 'update',
    id: reportId,
    data: { status, internal_note: internalNote, reviewer_user_id: input.reviewerUserId || null },
  });
  if (!result.rows[0]) throw codedError('REPORT_NOT_FOUND');
  return result.rows[0];
}

export default createCommunityReport;
