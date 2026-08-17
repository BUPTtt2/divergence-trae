import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAccountEntry,
  isProfileModalControlled,
} from './accountUiModel.js';

test('omitted showModal keeps the avatar self-controlled while explicit booleans stay controlled', () => {
  assert.equal(isProfileModalControlled(undefined), false);
  assert.equal(isProfileModalControlled(false), true);
  assert.equal(isProfileModalControlled(true), true);
});

test('account entry stays optional for visitors and becomes personal for registered users', () => {
  assert.deepEqual(getAccountEntry('loading'), {
    label: '账号加载中',
    disabled: true,
    intent: 'none',
  });
  assert.deepEqual(getAccountEntry('anonymous'), {
    label: '登录 / 注册',
    disabled: false,
    intent: 'account',
  });
  assert.deepEqual(getAccountEntry('offline'), {
    label: '登录 / 注册',
    disabled: false,
    intent: 'account',
  });
  assert.deepEqual(getAccountEntry('registered'), {
    label: '我的账号',
    disabled: false,
    intent: 'account',
  });
});

