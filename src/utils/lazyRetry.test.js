import test from 'node:test';
import assert from 'node:assert/strict';

import { loadWithRetry } from './lazyRetry.js';

test('loadWithRetry retries a transient chunk error and resolves', async () => {
  let attempts = 0;
  const module = await loadWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('Failed to fetch dynamically imported module');
    }
    return { default: 'loaded' };
  }, { retries: 1, delayMs: 0 });

  assert.equal(attempts, 2);
  assert.equal(module.default, 'loaded');
});

test('loadWithRetry rejects after the configured attempts instead of hanging', async () => {
  let attempts = 0;
  const loader = async () => {
    attempts += 1;
    throw new Error('Importing a module script failed');
  };

  await assert.rejects(
    loadWithRetry(loader, { retries: 2, delayMs: 0 }),
    /Importing a module script failed/,
  );
  assert.equal(attempts, 3);
});

test('loadWithRetry does not retry application errors', async () => {
  let attempts = 0;

  await assert.rejects(
    loadWithRetry(async () => {
      attempts += 1;
      throw new Error('component crashed');
    }, { retries: 3, delayMs: 0 }),
    /component crashed/,
  );
  assert.equal(attempts, 1);
});
