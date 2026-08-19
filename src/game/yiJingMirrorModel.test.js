import test from 'node:test';
import assert from 'node:assert/strict';

import { createYiJingMirror } from './yiJingMirrorModel.js';

const oracle = {
  primary: {
    lower: { name: '坎', symbol: '☵' },
    upper: { name: '离', symbol: '☲' },
  },
  changed: {
    lower: { name: '坤', symbol: '☷' },
    upper: { name: '离', symbol: '☲' },
  },
  mutual: {
    lower: { name: '震', symbol: '☳' },
    upper: { name: '兑', symbol: '☱' },
  },
  opposite: {
    lower: { name: '离', symbol: '☲' },
    upper: { name: '坎', symbol: '☵' },
  },
  dynamics: [1, 4],
  lineMeta: [
    { position: 0, perspective: 'financial', knowledgeState: 'verified' },
    { position: 1, perspective: 'risk', knowledgeState: 'contested', isDynamic: true },
    { position: 2, perspective: 'career', knowledgeState: 'unknown' },
    { position: 3, perspective: 'action', knowledgeState: 'verified' },
    { position: 4, perspective: 'emotional', knowledgeState: 'contested', isDynamic: true },
    { position: 5, perspective: 'strategic', knowledgeState: 'unknown' },
  ],
};

test('the Yi Jing mirror describes the actual trigrams and moving lines instead of evidence counts', () => {
  const mirror = createYiJingMirror(oracle);
  assert.equal(mirror.primaryName, '离坎');
  assert.equal(mirror.primaryStructure, '上离☲ · 下坎☵');
  assert.equal(mirror.changeText, '二、五爻动，之卦为离坤。');
  assert.equal(mirror.mutualName, '兑震');
  assert.equal(mirror.oppositeName, '坎离');
  assert.doesNotMatch(JSON.stringify(mirror), /0项已验证|项未知|项冲突/);
  assert.deepEqual(mirror.evidenceCounts, { verified: 2, unknown: 2, contested: 2 });
});

test('a still hexagram is named as a still hexagram and never invents a changed path', () => {
  const mirror = createYiJingMirror({ ...oracle, dynamics: [], lineMeta: oracle.lineMeta.map((line) => ({ ...line, isDynamic: false })) });
  assert.equal(mirror.changeText, '此局为静卦，无动爻；先以本卦照见当前结构。');
});
