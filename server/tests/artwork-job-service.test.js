import test from 'node:test';
import assert from 'node:assert/strict';
import { runArtworkJob, selectArtworkVersion } from '../src/services/artworkJobService.js';

function repositoryFixture() {
  const jobs = [];
  const versions = [];
  return {
    jobs,
    versions,
    async findJob(cardId, userId, idempotencyKey) {
      return jobs.find((job) => job.card_id === cardId && job.user_id === userId && job.idempotency_key === idempotencyKey) || null;
    },
    async countReadyVersions(cardId, userId) {
      return versions.filter((version) => version.card_id === cardId && version.user_id === userId).length;
    },
    async insertJob(job) { jobs.push(job); return job; },
    async updateJob(id, patch) {
      const job = jobs.find((item) => item.id === id);
      Object.assign(job, patch);
      return job;
    },
    async insertVersion(version) { versions.push(version); return version; },
    async listVersions(cardId, userId) { return versions.filter((version) => version.card_id === cardId && version.user_id === userId); },
    async findVersion(id, cardId, userId) { return versions.find((version) => version.id === id && version.card_id === cardId && version.user_id === userId) || null; },
    async selectVersion(id, cardId, userId) {
      versions.forEach((version) => { if (version.card_id === cardId && version.user_id === userId) version.selected = version.id === id; });
      return versions.find((version) => version.id === id);
    },
  };
}

const card = {
  id: 'card-1',
  user_id: 'user-1',
  question: '要不要换工作？',
  decision: '先验证',
  gua: '风山渐',
};

test('first included generation creates one recoverable version and idempotent retries do not charge twice', async () => {
  const repository = repositoryFixture();
  const generator = async () => ({ available: true, url: 'https://provider.example.test/temp.png', source: 'seedream', model: 'seedream-4' });
  const first = await runArtworkJob({ card, userId: 'user-1', styleId: 'ink_landscape', idempotencyKey: 'request-1' }, { repository, generator, now: () => 1000 });
  const replay = await runArtworkJob({ card, userId: 'user-1', styleId: 'ink_landscape', idempotencyKey: 'request-1' }, { repository, generator, now: () => 2000 });

  assert.equal(first.job.status, 'ready');
  assert.equal(first.job.creditConsumed, true);
  assert.equal(first.version.persistent, false);
  assert.equal(first.version.selected, false);
  assert.equal(replay.job.id, first.job.id);
  assert.equal(repository.jobs.length, 1);
  assert.equal(repository.versions.length, 1);
});

test('provider failure preserves the included credit and never creates a version', async () => {
  const repository = repositoryFixture();
  const result = await runArtworkJob({ card, userId: 'user-1', styleId: 'minimal_xuan', idempotencyKey: 'request-fail' }, {
    repository,
    generator: async () => ({ available: false, reason: 'provider_error' }),
    now: () => 1000,
  });

  assert.equal(result.job.status, 'failed');
  assert.equal(result.job.creditConsumed, false);
  assert.equal(result.job.errorCode, 'provider_error');
  assert.equal(repository.versions.length, 0);
});

test('regeneration requires entitlement after the included successful version', async () => {
  const repository = repositoryFixture();
  repository.versions.push({ id: 'existing-version', card_id: 'card-1', user_id: 'user-1' });

  await assert.rejects(
    () => runArtworkJob({ card, userId: 'user-1', styleId: 'mineral_color', idempotencyKey: 'request-2' }, { repository, generator: async () => ({ available: true }) }),
    (error) => error.code === 'ARTWORK_CREDIT_REQUIRED',
  );
});

test('version selection is owner-scoped and explicit', async () => {
  const repository = repositoryFixture();
  repository.versions.push({ id: 'version-1', card_id: 'card-1', user_id: 'user-1', selected: false });

  const selected = await selectArtworkVersion({ cardId: 'card-1', versionId: 'version-1', userId: 'user-1' }, { repository });
  assert.equal(selected.selected, true);
  await assert.rejects(
    () => selectArtworkVersion({ cardId: 'card-1', versionId: 'version-1', userId: 'user-2' }, { repository }),
    (error) => error.code === 'ARTWORK_VERSION_NOT_FOUND',
  );
});
