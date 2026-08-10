import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../public/api-config.js', import.meta.url), 'utf8');

function configuredBase(hostname) {
  const context = { window: { location: { hostname } } };
  vm.runInNewContext(source, context);
  return context.window.__API_BASE__;
}

test('loopback hosts use the same-origin development proxy', () => {
  assert.equal(configuredBase('localhost'), '');
  assert.equal(configuredBase('127.0.0.1'), '');
});

test('non-loopback hosts keep the production API base', () => {
  assert.equal(configuredBase('example.com'), 'https://yance-bagua-engine.vercel.app');
});
