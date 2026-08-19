import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommunityReport, updateCommunityReport } from '../src/services/communityReportService.js';

test('community reports accept only bounded reasons and owner identity comes from the server', async () => {
  const calls = [];
  const queryImpl = async (operation) => {
    calls.push(operation);
    if (operation.table === 'community_posts') return { rows: [{ id: 'post-1' }], rowCount: 1 };
    return { rows: [operation.data], rowCount: 1 };
  };
  const report = await createCommunityReport({ reporterUserId: 'user-1', targetType: 'post', targetId: 'post-1', reason: 'harassment', details: '攻击性表达' }, { queryImpl, now: () => '2026-08-18T00:00:00.000Z', generateId: () => 'report-1' });
  assert.equal(report.reporter_user_id, 'user-1');
  assert.equal(report.details, '攻击性表达');
  assert.equal(calls.at(-1).data.status, 'unread');
  await assert.rejects(() => createCommunityReport({ reporterUserId: 'user-1', targetType: 'post', targetId: 'post-1', reason: 'anything' }, { queryImpl }), (error) => error.code === 'INVALID_REPORT_REASON');
});

test('moderation updates have explicit states and bounded internal notes', async () => {
  const queryImpl = async (operation) => ({ rows: [{ id: operation.id, ...operation.data }], rowCount: 1 });
  const report = await updateCommunityReport('report-1', { status: 'resolved', internalNote: '已核验并隐藏', reviewerUserId: 'admin-1' }, { queryImpl });
  assert.equal(report.status, 'resolved');
  assert.equal(report.reviewer_user_id, 'admin-1');
  await assert.rejects(() => updateCommunityReport('report-1', { status: 'deleted', reviewerUserId: 'admin-1' }, { queryImpl }), (error) => error.code === 'INVALID_REPORT_STATUS');
});
