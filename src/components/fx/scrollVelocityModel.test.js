import test from 'node:test';
import assert from 'node:assert/strict';

import { createScrollVelocityAnimation } from './scrollVelocityModel.js';

test('the capability strip continuously travels instead of only shifting once with scroll progress', () => {
  const animation = createScrollVelocityAnimation({ baseVelocity: 1.4, direction: 1 });
  assert.deepEqual(animation.animate.x, ['0%', '-50%']);
  assert.equal(animation.transition.repeat, Infinity);
  assert.equal(animation.transition.ease, 'linear');
  assert.ok(animation.transition.duration >= 20);
});

test('reduced motion keeps a stable readable strip', () => {
  assert.equal(createScrollVelocityAnimation({ reducedMotion: true }), null);
});
