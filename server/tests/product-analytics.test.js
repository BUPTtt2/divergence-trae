import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateProductAnalytics,
  normalizeProductEvent,
} from '../src/services/productAnalytics.js';

test('event normalization rejects unknown events and strips private content fields', () => {
  assert.equal(normalizeProductEvent({ event: 'invented_event' }, { principalId: 'u1' }), null);
  const row = normalizeProductEvent({
    event: 'deliberation_started',
    analyticsSessionId: 'visit-1',
    deliberationSessionId: 's1',
    releaseId: 'release-1',
    mode: 'kiosk',
    deviceClass: 'tablet',
    properties: {
      phase: 'input',
      question: 'private decision',
      prompt: 'private prompt',
      errorCode: 'NONE',
    },
  }, { principalId: 'u1', now: 1 });

  assert.equal(row.user_id, 'u1');
  assert.equal(row.analytics_session_id, 'visit-1');
  assert.equal(row.deliberation_session_id, 's1');
  assert.equal(row.mode, 'kiosk');
  assert.deepEqual(row.properties, { phase: 'input', errorCode: 'NONE' });
});

test('analytics deduplicates restored phases and exposes every rate with its sample size', () => {
  const rows = [
    row('u1', 'visit-1', 's1', 'deliberation_started', 10),
    row('u1', 'visit-1', 's1', 'phase_entered', 11, { phase: 'input' }),
    row('u1', 'visit-1', 's1', 'phase_entered', 12, { phase: 'input' }),
    row('u1', 'visit-1', 's1', 'phase_entered', 20, { phase: 'final' }),
    row('u1', 'visit-1', 's1', 'deliberation_completed', 21, { durationMs: 11 }),
    row('u1', 'visit-1', 's1', 'deliberation_completed', 22, { durationMs: 999 }),
    row('u2', 'visit-2', 's2', 'deliberation_started', 30),
    row('u2', 'visit-2', 's2', 'phase_entered', 31, { phase: 'input' }),
  ];

  const metrics = aggregateProductAnalytics(rows);

  assert.equal(metrics.visitors, 2);
  assert.equal(metrics.visits, 2);
  assert.equal(metrics.starts, 2);
  assert.equal(metrics.completions, 1);
  assert.deepEqual(metrics.completionRate, { numerator: 1, denominator: 2, rate: 0.5 });
  assert.equal(metrics.funnel.find((step) => step.phase === 'input').sessions, 2);
  assert.equal(metrics.funnel.find((step) => step.phase === 'final').sessions, 1);
  assert.deepEqual(metrics.durationMs, { average: 11, p50: 11, p90: 11, samples: 1 });
});

test('admin audit does not count as a visitor or visit', () => {
  const rows = [row('admin', 'ops-visit', null, 'ops_accessed', 10, { surface: 'overview' })];
  const metrics = aggregateProductAnalytics(rows);
  assert.equal(metrics.visitors, 0);
  assert.equal(metrics.visits, 0);
});

test('artwork job events expose reliability without retaining prompts or card text', () => {
  const normalized = normalizeProductEvent({
    event: 'artwork_job_completed',
    properties: {
      cardId: 'card-1', styleId: 'ink_landscape', success: false,
      durationMs: 4200, errorCode: 'provider_error', persistent: false,
      includedCredit: true, prompt: 'private prompt', question: 'private question',
    },
  }, { principalId: 'u1', now: 1 });
  assert.deepEqual(normalized.properties, {
    cardId: 'card-1', styleId: 'ink_landscape', success: false,
    durationMs: 4200, errorCode: 'provider_error', persistent: false, includedCredit: true,
  });
  const metrics = aggregateProductAnalytics([{ ...normalized, analytics_session_id: 'visit-1' }]);
  assert.equal(metrics.reliability.artworkRequests, 1);
  assert.equal(metrics.reliability.artworkFailures, 1);
});

test('analytics separates release and kiosk filters without inventing zero-sample trends', () => {
  const rows = [
    { ...row('u1', 'v1', 's1', 'deliberation_started', 10), release_id: 'r1', mode: 'standard' },
    { ...row('u2', 'v2', 's2', 'deliberation_started', 20), release_id: 'r2', mode: 'kiosk' },
    { ...row('u2', 'v2', 's2', 'deliberation_completed', 30), release_id: 'r2', mode: 'kiosk' },
  ];

  const metrics = aggregateProductAnalytics(rows, { releaseId: 'r2', mode: 'kiosk' });
  assert.equal(metrics.starts, 1);
  assert.deepEqual(metrics.completionRate, { numerator: 1, denominator: 1, rate: 1 });
  assert.deepEqual(aggregateProductAnalytics([], {}).completionRate, { numerator: 0, denominator: 0, rate: null });
});

function row(userId, visitId, sessionId, eventName, occurredAt, properties = {}) {
  return {
    id: `${sessionId}-${eventName}-${occurredAt}`,
    user_id: userId,
    analytics_session_id: visitId,
    deliberation_session_id: sessionId,
    session_id: sessionId,
    event_name: eventName,
    properties,
    occurred_at: new Date(occurredAt).toISOString(),
    release_id: 'r1',
    mode: 'standard',
    device_class: 'desktop',
  };
}
