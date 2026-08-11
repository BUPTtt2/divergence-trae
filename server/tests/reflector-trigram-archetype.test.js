import test from 'node:test';
import assert from 'node:assert/strict';

import { mapToHexagram } from '../src/services/reflector.js';

test('unknown evidence states do not mechanically collapse every session to Kun', () => {
  const dimensions = [
    { perspective: 'strategic' },
    { perspective: 'emotional' },
    { perspective: 'practical' },
    { perspective: 'action' },
    { perspective: 'risk' },
    { perspective: 'experience' },
  ];
  const oracle = mapToHexagram({ byPerspective: {} }, dimensions, {
    gaps: dimensions.map(({ perspective }) => ({ perspective })),
  });
  assert.notDeepEqual(oracle.primary.lines, [0, 0, 0, 0, 0, 0]);
  assert.equal(oracle.lineMeta.every((line) => line.knowledgeState === 'unknown'), true);
});
