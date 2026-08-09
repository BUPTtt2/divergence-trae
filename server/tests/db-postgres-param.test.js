import test from 'node:test';
import assert from 'node:assert/strict';

import { toPostgresParam } from '../src/services/db.js';

test('PostgreSQL 参数会把 JavaScript 数组编码为 JSON，而不是 PostgreSQL array literal', () => {
  assert.equal(toPostgresParam([]), '[]');
  assert.equal(
    toPostgresParam([{ tool: 'web_search', ok: true }]),
    '[{"tool":"web_search","ok":true}]',
  );
});

test('PostgreSQL 参数保留标量和普通对象的 pg 原生行为', () => {
  const objectValue = { phase: 'ready' };
  assert.equal(toPostgresParam(null), null);
  assert.equal(toPostgresParam('ready'), 'ready');
  assert.equal(toPostgresParam(3), 3);
  assert.equal(toPostgresParam(objectValue), objectValue);
});
