import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('./LiveArenaOverlay.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./liveArenaOverlay.css', import.meta.url), 'utf8');

test('crystallize and Lens review glow follows standard, reduced and off motion modes', () => {
  assert.match(component, /live-arena__cue--motion-\$\{mode\}/);
  assert.match(styles, /live-arena__cue--motion-reduced[\s\S]*box-shadow:/);
  assert.match(styles, /live-arena__cue--motion-off[\s\S]*box-shadow:\s*none/);
});
