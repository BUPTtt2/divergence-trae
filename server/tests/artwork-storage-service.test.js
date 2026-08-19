import test from 'node:test';
import assert from 'node:assert/strict';

import { persistArtwork, getArtworkStorageCapability } from '../src/services/artworkStorageService.js';

function imageResponse({ contentType = 'image/png', length = 4 } = {}) {
  const bytes = new Uint8Array(length).fill(7);
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType, 'content-length': String(length) }),
    async arrayBuffer() { return bytes.buffer; },
  };
}

test('persists a bounded provider image to a stable Blob URL', async () => {
  const uploads = [];
  const result = await persistArtwork({
    sourceUrl: 'https://provider.example/temp.png',
    cardId: 'card 1',
    jobId: 'job-1',
    versionId: 'version-1',
  }, {
    token: 'blob-token',
    fetchImpl: async () => imageResponse(),
    putImpl: async (pathname, body, options) => {
      uploads.push({ pathname, body, options });
      return { url: 'https://store.public.blob.vercel-storage.com/artwork.png', pathname };
    },
  });

  assert.equal(result.url, 'https://store.public.blob.vercel-storage.com/artwork.png');
  assert.equal(result.contentType, 'image/png');
  assert.equal(result.size, 4);
  assert.match(uploads[0].pathname, /^destiny-artwork\/card-1\/job-1\/version-1\.png$/);
  assert.equal(uploads[0].options.addRandomSuffix, true);
  assert.equal(uploads[0].options.access, 'public');
});

test('rejects unsupported and oversized provider responses before upload', async () => {
  await assert.rejects(
    () => persistArtwork({ sourceUrl: 'https://provider.example/file.svg', cardId: 'c', jobId: 'j', versionId: 'v' }, {
      token: 'blob-token',
      fetchImpl: async () => imageResponse({ contentType: 'image/svg+xml' }),
      putImpl: async () => assert.fail('must not upload'),
    }),
    (error) => error.code === 'ARTWORK_STORAGE_TYPE_INVALID',
  );
  await assert.rejects(
    () => persistArtwork({ sourceUrl: 'https://provider.example/file.png', cardId: 'c', jobId: 'j', versionId: 'v' }, {
      token: 'blob-token',
      maxBytes: 3,
      fetchImpl: async () => imageResponse({ length: 4 }),
      putImpl: async () => assert.fail('must not upload'),
    }),
    (error) => error.code === 'ARTWORK_STORAGE_TOO_LARGE',
  );
});

test('storage capability is disabled without a server token', () => {
  assert.deepEqual(getArtworkStorageCapability({ token: '' }), {
    enabled: false,
    provider: 'vercel_blob',
    reason: 'BLOB_READ_WRITE_TOKEN_MISSING',
  });
});
