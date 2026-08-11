import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('./calendarModel.js').catch(() => null);

test('calendar combines real decision cards and follow-up dates without synthetic points', () => {
  assert.ok(model, 'calendarModel module must exist');
  const entries = model.buildDecisionCalendar([
    { id: 'card-1', title: '两周试行', created_at: '2026-08-09T01:00:00.000Z' },
  ], [
    { id: 'follow-1', card_id: 'card-1', question: '试行有效吗', follow_up_date: '2026-08-16', status: 'pending' },
  ]);

  assert.deepEqual(entries.map((entry) => [entry.kind, entry.date]), [
    ['decision', '2026-08-09'],
    ['follow-up', '2026-08-16'],
  ]);
  assert.equal(entries[1].linkedCardId, 'card-1');
});

test('calendar drops records that have no authoritative date', () => {
  assert.ok(model, 'calendarModel module must exist');
  assert.deepEqual(model.buildDecisionCalendar([{ id: 'undated' }], [{ id: 'also-undated' }]), []);
});

test('calendar merges cloud and local decisions without duplicating the same session', () => {
  assert.ok(model, 'calendarModel module must exist');
  const entries = model.buildRecoverableDecisionCalendar({
    cloudCards: [{ id: 'remote-1', source_session_id: 'sess-1', title: '云端标题', created_at: '2026-08-09T01:00:00.000Z' }],
    localCards: [
      { id: 'local-1', sourceSessionId: 'sess-1', title: '本机标题', date: '2026-08-09' },
      { id: 'local-2', sourceSessionId: 'sess-2', title: '本机可恢复', date: '2026-08-10' },
    ],
    followUps: [{ id: 'follow-1', card_id: 'remote-1', follow_up_date: '2026-08-16' }],
  });

  assert.deepEqual(entries.map((entry) => [entry.kind, entry.date]), [
    ['decision', '2026-08-09'],
    ['decision', '2026-08-10'],
    ['follow-up', '2026-08-16'],
  ]);
  assert.equal(entries[0].title, '云端标题');
});
