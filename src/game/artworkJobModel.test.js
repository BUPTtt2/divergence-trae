import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTWORK_STYLES,
  applyArtworkJobUpdate,
  artworkJobPollDelay,
  createArtworkStudioState,
} from './artworkJobModel.js';

test('system artwork is always ready before any generated artwork job', () => {
  const state = createArtworkStudioState(null);

  assert.equal(state.systemArtwork.available, true);
  assert.equal(state.systemArtwork.label, '系统典藏画境');
  assert.equal(state.job, null);
  assert.deepEqual(ARTWORK_STYLES.map((style) => style.id), ['ink_landscape', 'mineral_color', 'minimal_xuan']);
});

test('a persisted artwork job resumes through queued, generating, ready and failed states', () => {
  const queued = applyArtworkJobUpdate(createArtworkStudioState(null), { id: 'job-1', status: 'queued', styleId: 'ink_landscape' });
  const generating = applyArtworkJobUpdate(queued, { id: 'job-1', status: 'generating', styleId: 'ink_landscape' });
  const ready = applyArtworkJobUpdate(generating, {
    id: 'job-1', status: 'ready', styleId: 'ink_landscape',
    version: { id: 'version-1', url: 'https://cdn.example.test/art.png', selected: false },
  });
  const failed = applyArtworkJobUpdate(generating, { id: 'job-1', status: 'failed', styleId: 'ink_landscape', errorCode: 'provider_error', creditConsumed: false });

  assert.equal(generating.job.status, 'generating');
  assert.equal(ready.versions[0].id, 'version-1');
  assert.equal(ready.currentArtwork.url, ready.systemArtwork.url);
  assert.equal(failed.job.creditConsumed, false);
});

test('polling stays bounded and stops for terminal jobs', () => {
  assert.equal(artworkJobPollDelay({ status: 'queued' }, 0), 1000);
  assert.equal(artworkJobPollDelay({ status: 'generating' }, 5), 5000);
  assert.equal(artworkJobPollDelay({ status: 'ready' }, 2), null);
  assert.equal(artworkJobPollDelay({ status: 'failed' }, 2), null);
});
