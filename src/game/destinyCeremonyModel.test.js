import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTrigramOrbit,
  createDestinyScenePlan,
  resolveDestinyArtwork,
  resolveHexagramName,
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

test('hexagram name never duplicates equal upper and lower trigrams', () => {
  assert.equal(resolveHexagramName({ primary: { lower: { name: '坤' }, upper: { name: '坤' } } }), '坤');
  assert.equal(resolveHexagramName({ primary: { lower: { name: '乾' }, upper: { name: '乾' } } }), '乾');
});

test('explicit formal hexagram name wins over trigram composition', () => {
  assert.equal(resolveHexagramName({ primary: { name: '风山渐', lower: { name: '艮' }, upper: { name: '巽' } } }), '风山渐');
});

test('mobile keeps one centered destiny card while reducing decorative load', () => {
  const mobile = createDestinyScenePlan({ phase: 'final', width: 390, height: 844, dpr: 3 });
  const desktop = createDestinyScenePlan({ phase: 'final', width: 1440, height: 900, dpr: 2 });

  assert.equal(mobile.visible, true);
  assert.equal(mobile.legacyCardVisible, false);
  assert.equal(mobile.particleCount < desktop.particleCount, true);
  assert.equal(mobile.textureAnisotropy < desktop.textureAnisotropy, true);
  assert.deepEqual(mobile.groupPosition, [0, 0, 0]);
});

test('reduced motion keeps the card but removes automatic reveal travel', () => {
  const plan = createDestinyScenePlan({ phase: 'path_reveal', width: 390, height: 844, dpr: 2, reducedMotion: true });

  assert.equal(plan.visible, true);
  assert.equal(plan.animateRise, false);
  assert.equal(plan.animateHover, false);
});
