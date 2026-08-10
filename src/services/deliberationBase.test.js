import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeliberationBases, shouldTryNextDeliberationBase } from './deliberationBase.js';

test('deliberation shares the configured authentication backend by default', () => {
  assert.deepEqual(buildDeliberationBases({
    explicitBase: null,
    apiBase: 'https://api.example.com',
  }), ['https://api.example.com', '', 'http://localhost:3001']);
});

test('an explicit deliberation backend remains authoritative', () => {
  assert.deepEqual(buildDeliberationBases({
    explicitBase: 'http://127.0.0.1:3002',
    apiBase: 'https://api.example.com',
  }), ['http://127.0.0.1:3002']);
});

test('duplicate same-origin candidates are removed without dropping the empty base', () => {
  assert.deepEqual(buildDeliberationBases({ explicitBase: null, apiBase: '' }), [
    '',
    'http://localhost:3001',
  ]);
});

test('an authenticated cached backend owns its HTTP errors', () => {
  assert.equal(shouldTryNextDeliberationBase({ status: 503, cached: true }), false);
  assert.equal(shouldTryNextDeliberationBase({ status: 404, cached: true, error: '路由不存在' }), false);
});

test('backend discovery skips unavailable candidate deployments', () => {
  assert.equal(shouldTryNextDeliberationBase({ status: 503, cached: false }), true);
  assert.equal(shouldTryNextDeliberationBase({ status: 404, cached: false, error: 'Application not found' }), true);
  assert.equal(shouldTryNextDeliberationBase({ status: 422, cached: false, error: 'agentIds 格式错误' }), false);
});
