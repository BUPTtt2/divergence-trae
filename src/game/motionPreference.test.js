import test from 'node:test';
import assert from 'node:assert/strict';

import { effectiveMotionMode, motionConfigFor, resolveMotionMode } from './motionPreference.js';

test('system reduced motion caps standard at reduced while preserving explicit off', () => {
  assert.equal(resolveMotionMode(undefined, true), 'reduced');
  assert.equal(resolveMotionMode(undefined, false), 'standard');
  assert.equal(resolveMotionMode('off', false), 'off');
  assert.equal(effectiveMotionMode('standard', true), 'reduced');
  assert.equal(effectiveMotionMode('reduced', true), 'reduced');
  assert.equal(effectiveMotionMode('off', true), 'off');
  assert.equal(resolveMotionMode('invalid', true), 'reduced');
});

test('motion modes keep semantic state while reducing or removing transitions', () => {
  assert.deepEqual(motionConfigFor('standard', 'crystallize'), { enabled: true, duration: 2.2, intensity: 1 });
  assert.deepEqual(motionConfigFor('reduced', 'crystallize'), { enabled: true, duration: 0.35, intensity: 0.25 });
  assert.deepEqual(motionConfigFor('off', 'crystallize'), { enabled: false, duration: 0, intensity: 0 });
  assert.equal(motionConfigFor(effectiveMotionMode('off', true), 'lens-review').enabled, false);
});
