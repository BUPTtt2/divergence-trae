import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionMeasurement, formatElapsed } from './buildSessionMeasurement.js';

test('one-run meter formats elapsed time without inventing provider usage', () => {
  assert.equal(formatElapsed(65_000), '01:05');
  assert.deepEqual(buildSessionMeasurement({ elapsedMs: 65_000 }), {
    elapsed: '01:05',
    calls: 0,
    failedCalls: 0,
    tokens: null,
    image: '尚未生成',
  });
});

test('one-run meter exposes measured calls, tokens and destiny image outcome', () => {
  assert.deepEqual(buildSessionMeasurement({
    elapsedMs: 125_000,
    usageSummary: {
      calls: 11,
      failedCalls: 1,
      tokens: { total: 80_320 },
    },
    artwork: { available: true, source: 'seedream' },
  }), {
    elapsed: '02:05',
    calls: 11,
    failedCalls: 1,
    tokens: 80_320,
    image: 'Seedream 已生成',
  });
});
