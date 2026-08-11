import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('advisor selection keeps only a dim non-interactive scene beneath the council workbench', async () => {
  const source = await readFile(new URL('../../src/pages/Game.jsx', import.meta.url), 'utf8');
  assert.match(source, /presentationMode=\{sceneOverlayMode\}/);
  assert.match(source, /sceneOverlayMode = presentationMode \|\| companionOpen/);
  assert.match(source, /isPresentationPhase\(phase\)/);
  assert.match(source, /phase === 'agent_select'[\s\S]*className="council-stage"/);
});

test('pause and case edits preserve the confirmed council while a question targets one advisor', async () => {
  const source = await readFile(new URL('../../src/game/useDeliberationFlow.js', import.meta.url), 'utf8');
  assert.match(source, /commandType === 'QUESTION' && targetAgentId[\s\S]*\[targetAgentId\][\s\S]*: undefined/);
  assert.doesNotMatch(source, /commandType === 'QUESTION'[\s\S]{0,160}: \[\]/);
});
