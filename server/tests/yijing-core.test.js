import test from 'node:test';
import assert from 'node:assert/strict';

import { TRIGRAMS, trigramForPerspective } from '../src/data/yijingCore.js';

test('the eight trigrams keep distinct canonical three-line structures', () => {
  assert.equal(Object.keys(TRIGRAMS).length, 8);
  assert.equal(new Set(Object.values(TRIGRAMS).map((item) => item.lines.join(''))).size, 8);
  assert.deepEqual(TRIGRAMS.zhen.lines, [1, 0, 0]);
  assert.deepEqual(TRIGRAMS.xun.lines, [0, 1, 1]);
  assert.deepEqual(TRIGRAMS.gen.lines, [0, 0, 1]);
});

test('decision perspectives resolve to a named trigram without changing knowledge state', () => {
  assert.equal(trigramForPerspective('risk').name, '坎');
  assert.equal(trigramForPerspective('health').name, '坤');
});
