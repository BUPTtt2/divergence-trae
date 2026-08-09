import test from 'node:test';
import assert from 'node:assert/strict';

import { sandboxLayoutClass } from './layoutState.js';

test('decision phases reserve one dock while keeping the 3D stage visible', () => {
  assert.equal(sandboxLayoutClass('summary', true), 'decision-artifact-is-open');
  assert.equal(sandboxLayoutClass('final', false), 'decision-artifact-is-open');
});

test('conversation phases only reserve the companion dock while it is open', () => {
  assert.equal(sandboxLayoutClass('clarify_loop', true), 'companion-is-open');
  assert.equal(sandboxLayoutClass('agent_debate', false), '');
});
