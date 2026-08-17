import test from 'node:test';
import assert from 'node:assert/strict';

import { clearTrackingState, createTrackingContext, normalizeErrorCode, sanitizeTrackingProperties } from './tracker.js';

test('tracking context uses coarse device metadata and never includes page content', () => {
  assert.deepEqual(createTrackingContext({
    width: 834,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit Safari',
    search: '?kiosk=1',
    releaseId: '654722',
  }), {
    mode: 'kiosk',
    deviceClass: 'tablet',
    platformFamily: 'ios-safari',
    releaseId: '654722',
  });
});

test('runtime error messages become coarse codes instead of persisted content', () => {
  assert.equal(normalizeErrorCode('Request timed out while handling private decision'), 'TIMEOUT');
  assert.equal(normalizeErrorCode('Failed to fetch https://private.example/path'), 'NETWORK_ERROR');
  assert.equal(normalizeErrorCode('Unexpected content from user input'), 'CLIENT_RUNTIME_ERROR');
});

test('opting out clears queued events, offline buffer, and the persisted analytics identity', () => {
  const removed = [];
  const queue = [{ event: 'private-history' }];
  clearTrackingState({ removeItem: (key) => removed.push(key) }, queue);
  assert.deepEqual(queue, []);
  assert.deepEqual(removed.sort(), ['yance_anonymous_id', 'yance_track_queue']);
});

test('client property sanitizer removes decision and model content before queueing', () => {
  assert.deepEqual(sanitizeTrackingProperties({
    phase: 'summary',
    durationMs: 1200,
    success: false,
    errorCode: 'TIMEOUT',
    question: 'private',
    prompt: 'private',
    response: 'private',
  }), {
    phase: 'summary',
    durationMs: 1200,
    success: false,
    errorCode: 'TIMEOUT',
  });
});
