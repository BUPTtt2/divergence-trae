import test from 'node:test';
import assert from 'node:assert/strict';

import { getAuthErrorMessage } from './authErrorMessage.js';

test('credential errors stay actionable and do not expose raw fetch failures', () => {
  assert.equal(getAuthErrorMessage(new Error('邮箱或密码错误'), '登录失败'), '邮箱或密码错误');
  assert.equal(getAuthErrorMessage(new TypeError('Failed to fetch'), '登录失败'), '连接账号服务失败，请确认代理已开启后重试');
  assert.equal(getAuthErrorMessage(null, '注册失败'), '注册失败');
});

