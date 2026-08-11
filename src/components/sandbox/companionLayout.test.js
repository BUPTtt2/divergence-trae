import test from 'node:test';
import assert from 'node:assert/strict';

import { companionLayoutForViewport } from './companionLayout.js';

test('desktop and iPad landscape use a bounded overlay without resizing the stage', () => {
  assert.deepEqual(companionLayoutForViewport({ width: 1194, height: 834 }), {
    mode: 'overlay-sheet',
    width: 420,
    maxHeight: 798,
    stageInset: 0,
  });
});

test('portrait and small viewports use a full-height work drawer', () => {
  assert.deepEqual(companionLayoutForViewport({ width: 768, height: 1024 }), {
    mode: 'full-drawer',
    width: 752,
    maxHeight: 1008,
    stageInset: 0,
  });
  assert.equal(companionLayoutForViewport({ width: 390, height: 844 }).mode, 'full-drawer');
});

test('dock width is clamped to the compact assistant contract', async () => {
  const { companionDockStyle } = await import('./companionLayout.js');
  assert.deepEqual(companionDockStyle(760), { '--companion-dock-width': '420px' });
  assert.deepEqual(companionDockStyle(320), { '--companion-dock-width': '360px' });
});
