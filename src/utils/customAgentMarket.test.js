import test from 'node:test';
import assert from 'node:assert/strict';

import { getMarketAgents } from './customAgent.js';

test('legacy local storage never invents market advisors when no migrated data exists', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    assert.deepEqual(getMarketAgents(), []);
  } finally {
    globalThis.localStorage = previous;
  }
});
