import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeliberationBases } from './deliberationBase.js';

test('production API base is the only deliberation candidate', () => {
  assert.deepEqual(buildDeliberationBases({
    apiBase: 'https://yance-bagua-engine.vercel.app',
    production: true,
  }), ['https://yance-bagua-engine.vercel.app']);
});

test('explicit deliberation base always wins', () => {
  assert.deepEqual(buildDeliberationBases({
    explicitBase: 'https://runtime.example.com/',
    apiBase: 'https://api.example.com',
    production: true,
  }), ['https://runtime.example.com']);
});

test('development may use same-origin and localhost fallbacks', () => {
  assert.deepEqual(buildDeliberationBases({ apiBase: '', production: false }), ['', 'http://localhost:3001']);
});
