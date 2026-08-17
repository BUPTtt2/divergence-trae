import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseHorizontalPlacement, clampFloatingPosition } from './floatingPlacement.js';

test('floating menu opens toward the side with enough viewport space', () => {
  assert.equal(chooseHorizontalPlacement({ anchorX: 1160, viewportWidth: 1280, panelWidth: 288 }), 'left');
  assert.equal(chooseHorizontalPlacement({ anchorX: 80, viewportWidth: 1280, panelWidth: 288 }), 'right');
});

test('floating menu prefers the side with more space on narrow screens', () => {
  assert.equal(chooseHorizontalPlacement({ anchorX: 220, viewportWidth: 390, panelWidth: 288 }), 'left');
  assert.equal(chooseHorizontalPlacement({ anchorX: 80, viewportWidth: 390, panelWidth: 288 }), 'right');
});

test('saved floating position is clamped when the next viewport is smaller', () => {
  assert.deepEqual(clampFloatingPosition({
    position: { x: 1160, y: 700 },
    viewportWidth: 390,
    viewportHeight: 844,
  }), { x: 320, y: 700 });
});

test('mobile can reserve the bottom action area for primary controls', () => {
  assert.deepEqual(clampFloatingPosition({
    position: { x: 320, y: 700 }, viewportWidth: 390, viewportHeight: 844, bottomClearance: 260,
  }), { x: 320, y: 514 });
});
