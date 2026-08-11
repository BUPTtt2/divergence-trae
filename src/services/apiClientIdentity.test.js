import test from 'node:test';
import assert from 'node:assert/strict';

import { getUserId } from './apiClient.js';

test('API compatibility identity delegates to the synchronous base configuration reader', () => {
  assert.doesNotThrow(() => getUserId());
  assert.equal(getUserId(), null);
});
