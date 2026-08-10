import test from 'node:test';
import assert from 'node:assert/strict';

import { companionLayoutForViewport } from './companionLayout.js';

test('desktop and iPad landscape reserve a sidecar without hiding most of the stage', () => {
  assert.deepEqual(companionLayoutForViewport({ width: 1194, height: 834 }), {
    mode: 'sidecar',
    width: 380,
    maxHeight: 798,
    stageInset: 404,
  });
  assert.ok((1194 - 404) / 1194 >= 0.65);
});

test('portrait and small viewports use a bounded bottom sheet', () => {
  assert.deepEqual(companionLayoutForViewport({ width: 768, height: 1024 }), {
    mode: 'bottom-sheet',
    width: 752,
    maxHeight: 430,
    stageInset: 0,
  });
  assert.equal(companionLayoutForViewport({ width: 390, height: 844 }).mode, 'bottom-sheet');
});
