import test from 'node:test';
import assert from 'node:assert/strict';

import { createEscapeHandler, lockDocumentScroll } from './modalLifecycle.js';

test('modal scroll lock restores the exact document styles it replaced', () => {
  const documentLike = {
    body: { style: { overflow: 'auto', overscrollBehavior: 'contain' } },
  };

  const unlock = lockDocumentScroll(documentLike);
  assert.equal(documentLike.body.style.overflow, 'hidden');
  assert.equal(documentLike.body.style.overscrollBehavior, 'none');

  unlock();
  assert.equal(documentLike.body.style.overflow, 'auto');
  assert.equal(documentLike.body.style.overscrollBehavior, 'contain');
});

test('escape handler closes once and ignores unrelated keys', () => {
  let closeCount = 0;
  const handler = createEscapeHandler(() => { closeCount += 1; });

  handler({ key: 'Enter' });
  handler({ key: 'Escape' });
  assert.equal(closeCount, 1);
});

