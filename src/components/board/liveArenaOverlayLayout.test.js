import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';

const stylesheet = postcss.parse(
  fs.readFileSync(new URL('./liveArenaOverlay.css', import.meta.url), 'utf8'),
);
const gameSource = fs.readFileSync(new URL('../../pages/Game.jsx', import.meta.url), 'utf8');
const indexStyles = fs.readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

function mediaMatches(params, viewport) {
  return params.split(/\s+and\s+/).every((part) => {
    const condition = part.trim().replace(/^\(|\)$/g, '');
    const [feature, value] = condition.split(':').map((item) => item.trim());

    if (feature === 'min-width') return viewport.width >= Number.parseInt(value, 10);
    if (feature === 'max-width') return viewport.width <= Number.parseInt(value, 10);
    if (feature === 'orientation') {
      return value === (viewport.width > viewport.height ? 'landscape' : 'portrait');
    }
    if (feature === 'prefers-reduced-motion') return viewport.reducedMotion === (value === 'reduce');
    return false;
  });
}

// Parses authored declarations and applies this file's media-query policy; it is not a browser layout engine.
function declarationsForViewport(selector, viewport) {
  const declarations = {};

  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;

    const media = rule.parent?.type === 'atrule' && rule.parent.name === 'media'
      ? rule.parent.params
      : null;
    if (media && !mediaMatches(media, viewport)) return;

    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
  });

  return declarations;
}

const portrait = { width: 768, height: 1024, reducedMotion: false };
const landscape = { width: 1024, height: 768, reducedMotion: false };
const phone = { width: 767, height: 900, reducedMotion: false };
const desktop = { width: 1440, height: 900, reducedMotion: false };

test('768x1024 portrait keeps the arena in one safe-area-aware column without horizontal overflow', () => {
  const arena = declarationsForViewport('.live-arena', portrait);

  assert.equal(arena.position, 'fixed');
  assert.ok(Number.parseInt(arena['z-index'], 10) > 55);
  assert.equal(arena.display, 'flex');
  assert.equal(arena['flex-direction'], 'column');
  assert.equal(arena.width, 'auto');
  assert.match(arena.left, /env\(safe-area-inset-left\)/);
  assert.match(arena.right, /env\(safe-area-inset-right\)/);
  assert.match(arena.bottom, /env\(safe-area-inset-bottom\)/);
  assert.equal(arena['overflow-x'], 'hidden');
  assert.equal(arena['box-sizing'], 'border-box');
});

test('1024x768 landscape uses a bounded, vertically scrollable sidebar inside safe areas', () => {
  const arena = declarationsForViewport('.live-arena', landscape);

  assert.equal(arena.position, 'fixed');
  assert.ok(Number.parseInt(arena['z-index'], 10) > 55);
  assert.match(arena.width, /env\(safe-area-inset-left\)/);
  assert.match(arena.width, /env\(safe-area-inset-right\)/);
  assert.equal(arena['max-width'], '320px');
  assert.match(arena.top, /env\(safe-area-inset-top\)/);
  assert.match(arena.left, /env\(safe-area-inset-left\)/);
  assert.match(arena.bottom, /env\(safe-area-inset-bottom\)/);
  assert.equal(arena['overflow-y'], 'auto');
  assert.equal(arena['overflow-x'], 'hidden');
  assert.equal(arena['overscroll-behavior'], 'contain');
  assert.equal(arena['touch-action'], 'pan-y');
});

test('desktop keeps the existing container-relative overlay positioning', () => {
  const arena = declarationsForViewport('.live-arena', desktop);

  assert.equal(arena.position, 'absolute');
  assert.equal(arena['z-index'], '46');
});

test('767px and narrower uses a flowing card stack with controls that wrap instead of overflowing', () => {
  const arena = declarationsForViewport('.live-arena', phone);
  const header = declarationsForViewport('.live-arena__header', phone);
  const controls = declarationsForViewport('.live-arena__motion-controls', phone);

  assert.equal(arena.width, 'auto');
  assert.equal(arena['max-height'], 'none');
  assert.equal(arena['flex-direction'], 'column');
  assert.equal(header['flex-direction'], 'column');
  assert.equal(controls['flex-wrap'], 'wrap');
});

test('all primary controls expose at least a 44px touch target without hover-only selectors', () => {
  for (const selector of ['.live-arena__motion-controls button', '.live-arena__lens-toggle']) {
    const control = declarationsForViewport(selector, portrait);
    assert.ok(Number.parseFloat(control['min-width']) >= 44, `${selector} min-width`);
    assert.ok(Number.parseFloat(control['min-height']) >= 44, `${selector} min-height`);
  }

  stylesheet.walkRules((rule) => {
    assert.equal(rule.selectors.some((selector) => selector.includes(':hover')), false, rule.selector);
  });

  assert.match(gameSource, /const btnBase = \{[\s\S]*?minHeight:\s*44/);
  assert.match(gameSource, /className="game-root /);
  assert.match(indexStyles, /\.game-root button\s*\{[\s\S]*?min-height:\s*44px/);
});

test('system reduced-motion disables ornamental transitions while off mode remains static', () => {
  const reducedCue = declarationsForViewport('.live-arena__cue', { ...landscape, reducedMotion: true });
  const offCue = declarationsForViewport('.live-arena__cue--crystallize.live-arena__cue--motion-off', landscape);

  assert.equal(reducedCue.animation, 'none');
  assert.equal(reducedCue.transition, 'none');
  assert.equal(offCue['box-shadow'], 'none');
});
