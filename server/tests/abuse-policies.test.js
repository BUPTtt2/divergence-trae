import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePolicyChecks } from '../src/security/abusePolicies.js';

test('password reset requests are protected by email cooldown, hourly, daily and IP windows', () => {
  const checks = resolvePolicyChecks('passwordResetRequest', {
    body: { email: ' Person@Example.COM ' },
    ip: '198.51.100.8',
  });

  assert.deepEqual(checks.map(({ scope, subject, limit, windowSeconds }) => ({ scope, subject, limit, windowSeconds })), [
    { scope: 'password_reset_email_cooldown', subject: 'person@example.com', limit: 1, windowSeconds: 60 },
    { scope: 'password_reset_email_hour', subject: 'person@example.com', limit: 3, windowSeconds: 3600 },
    { scope: 'password_reset_email_day', subject: 'person@example.com', limit: 5, windowSeconds: 86400 },
    { scope: 'password_reset_ip_hour', subject: '198.51.100.8', limit: 10, windowSeconds: 3600 },
    { scope: 'password_reset_ip_day', subject: '198.51.100.8', limit: 30, windowSeconds: 86400 },
  ]);
});

test('auth and deliberation policies use the intended identity dimension', () => {
  const req = {
    body: { email: 'user@example.com', token: 'one-time-secret', refreshToken: 'refresh-secret' },
    principal: { userId: 'user-1' },
    ip: '203.0.113.9',
  };

  assert.deepEqual(resolvePolicyChecks('login', req).map((item) => item.scope), ['login_email_15m', 'login_ip_15m']);
  assert.deepEqual(resolvePolicyChecks('accountTokenConsume', req).map((item) => item.subject), ['one-time-secret', '203.0.113.9']);
  assert.deepEqual(resolvePolicyChecks('refresh', req).map((item) => item.subject), ['refresh-secret', '203.0.113.9']);
  assert.equal(resolvePolicyChecks('deliberationExecute', req)[0].subject, 'user-1');
});

test('community writes have separate post, reply and reaction budgets', () => {
  const req = { principal: { userId: 'user-1' }, ip: '127.0.0.1', body: {} };
  assert.deepEqual(resolvePolicyChecks('communityPost', req).map(({ scope, limit }) => [scope, limit]), [
    ['community_post_user_day', 10],
  ]);
  assert.deepEqual(resolvePolicyChecks('communityReply', req).map(({ scope, limit }) => [scope, limit]), [
    ['community_reply_user_hour', 20],
  ]);
  assert.deepEqual(resolvePolicyChecks('communityLike', req).map(({ scope, limit }) => [scope, limit]), [
    ['community_like_user_hour', 60],
  ]);
  assert.deepEqual(resolvePolicyChecks('communityReport', req).map(({ scope, limit }) => [scope, limit]), [
    ['community_report_user_day', 10],
    ['community_report_ip_day', 20],
  ]);
});

test('unknown policies fail closed during configuration', () => {
  assert.throws(() => resolvePolicyChecks('missingPolicy', {}), /Unknown abuse policy/);
});
