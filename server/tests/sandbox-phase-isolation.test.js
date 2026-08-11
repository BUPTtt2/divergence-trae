import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('advisor selection keeps only a dim non-interactive scene beneath the council workbench', async () => {
  const source = await readFile(new URL('../../src/pages/Game.jsx', import.meta.url), 'utf8');
  assert.match(source, /presentationMode=\{presentationMode\}/);
  assert.match(source, /sceneOverlayMode = presentationMode && !fateStage/);
  assert.match(source, /shouldMuteArena\(\{ phase, companionOpen, showHistoryPanel \}\)/);
  assert.match(source, /phase === 'agent_select'[\s\S]*className="council-stage"/);
});

test('pause and case edits preserve the confirmed council while a question targets explicit advisors', async () => {
  const source = await readFile(new URL('../../src/game/useDeliberationFlow.js', import.meta.url), 'utf8');
  assert.match(source, /commandType === 'QUESTION' && requestedTargetIds\.length === 0/);
  assert.match(source, /commandType, content, targetAgentIds: requestedTargetIds/);
  assert.doesNotMatch(source, /commandType === 'QUESTION'[\s\S]{0,160}targetAgentIds: \[\]/);
});
