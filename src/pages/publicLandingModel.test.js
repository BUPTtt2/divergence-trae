import test from 'node:test';
import assert from 'node:assert/strict';

import { getLandingActions, PUBLIC_NAVIGATION, WALKTHROUGH_STAGES } from './publicLandingModel.js';

test('public navigation contains only marketing and account destinations', () => {
  assert.deepEqual(PUBLIC_NAVIGATION.map((item) => item.href), ['#method', '#walkthrough', '#privacy']);
  assert.equal(PUBLIC_NAVIGATION.some((item) => item.href === '/agents'), false);
});

test('anonymous and registered visitors receive the same low-friction product entry', () => {
  assert.equal(getLandingActions('anonymous').primary.href, '/sandbox?new=1');
  assert.equal(getLandingActions('registered').primary.href, '/sandbox?new=1');
  assert.equal(getLandingActions('anonymous').account.label, '登录');
  assert.equal(getLandingActions('anonymous').account.event, 'open-auth-modal');
  assert.deepEqual(getLandingActions('anonymous').account.detail, { type: 'login' });
  assert.equal(getLandingActions('registered').account.label, '我的账号');
  assert.equal(getLandingActions('registered').account.event, 'open-account-modal');
});

test('walkthrough tells the complete decision loop without fake metrics', () => {
  assert.deepEqual(WALKTHROUGH_STAGES.map((stage) => stage.key), ['question', 'council', 'choice', 'card']);
  assert.equal(WALKTHROUGH_STAGES.some((stage) => /\d+[+%]/.test(stage.title)), false);
});
