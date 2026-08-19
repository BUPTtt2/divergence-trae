import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Vercel serves the SPA document for direct client-side routes', async () => {
  const configUrl = new URL('../../vercel.json', import.meta.url);
  const config = JSON.parse(await readFile(configUrl, 'utf8'));

  assert.deepEqual(config.rewrites, [
    { source: '/(.*)', destination: '/index.html' },
  ]);
  assert.equal(config.routes, undefined);
});
