import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const component = fs.readFileSync(new URL('./LiveArenaOverlay.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./liveArenaOverlay.css', import.meta.url), 'utf8');

test('crystallize and Lens review glow follows standard, reduced and off motion modes', () => {
  assert.match(component, /live-arena__cue--motion-\$\{mode\}/);
  assert.match(styles, /live-arena__cue--motion-reduced[\s\S]*box-shadow:/);
  assert.match(styles, /live-arena__cue--motion-off[\s\S]*box-shadow:\s*none/);
});

test('component applies system reduced motion to saved standard and renders off cues without motion styles', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  const projection = {
    lastSequence: 1,
    transport: { connected: true, replaying: false },
    tasks: {},
    agents: {},
    evidence: {},
    conflicts: [],
    motionCue: { id: 'cue-1', kind: 'lens-review' },
  };
  let LiveArenaOverlay;

  function render(savedMode, prefersReduced) {
    globalThis.window = {
      localStorage: { getItem: () => savedMode, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({
        matches: prefersReduced,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    };
    return renderToStaticMarkup(createElement(LiveArenaOverlay, { projection }));
  }

  try {
    ({ default: LiveArenaOverlay } = await vite.ssrLoadModule('/src/components/board/LiveArenaOverlay.jsx'));
    const reducedMarkup = render('standard', true);
    const offMarkup = render('off', true);

    assert.match(reducedMarkup, /live-arena__cue--motion-reduced/);
    assert.match(offMarkup, /live-arena__cue--motion-off/);
    assert.doesNotMatch(offMarkup, /style=/);
  } finally {
    delete globalThis.window;
    await vite.close();
  }
});
