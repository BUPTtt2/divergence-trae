import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTrigramOrbit,
  resolveDestinyArtwork,
  shouldShowDestinyCeremony,
} from './destinyCeremonyModel.js';

test('keeps the sealed card on stage through every destiny phase', () => {
  assert.equal(shouldShowDestinyCeremony('branch_select'), false);
  assert.equal(shouldShowDestinyCeremony('path_reveal'), true);
  assert.equal(shouldShowDestinyCeremony('committing'), true);
  assert.equal(shouldShowDestinyCeremony('final'), true);
});

test('uses the session artwork in the scene and falls back to the bundled generated painting', () => {
  assert.equal(
    resolveDestinyArtwork({ available: true, url: 'https://example.test/session-art.png' }),
    'https://example.test/session-art.png',
  );
  assert.equal(
    resolveDestinyArtwork(null),
    '/assets/generated/xuanmo/destiny-card-archive-v1.png',
  );
});

test('forms one complete bagua orbit without random positions', () => {
  const orbit = createTrigramOrbit(1.48);
  assert.deepEqual(orbit.map((item) => item.glyph), ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']);
  assert.equal(orbit.length, 8);
  assert.equal(orbit.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)), true);
  assert.equal(new Set(orbit.map((item) => `${item.x}:${item.y}`)).size, 8);
});
