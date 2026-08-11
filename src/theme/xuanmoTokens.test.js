import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stylesheetUrl = new URL('./xuanmo.css', import.meta.url);

test('xuanmo theme exposes the visual contract and resilient generated assets', async () => {
  const css = await readFile(stylesheetUrl, 'utf8');

  for (const token of [
    '--xm-ink-0',
    '--xm-paper',
    '--xm-gold',
    '--xm-cinnabar',
    '--xm-panel',
    '--xm-motion-fast',
    '--xm-motion-slow',
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`));
  }

  assert.match(css, /arena-celestial-v3\.jpg/);
  assert.match(css, /page-wash-v3\.jpg/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.xm-surface/);
});
