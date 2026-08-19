import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/services/db.js';
import { verifyToken } from '../src/services/authTokenService.js';
import { createAccountActionToken } from '../src/services/accountRecoveryService.js';

async function withServer(run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(base, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function patch(base, path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('registration hashes passwords and login verifies the supplied password', async () => {
  await withServer(async (base) => {
    const email = `identity-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const password = 'safe-password-123';
    const registered = await post(base, '/api/auth/register', {
      email,
      password,
      nickname: '测试用户',
    });

    assert.equal(registered.status, 201);
    const accessClaims = verifyToken(registered.body.accessToken, 'access');
    assert.equal(accessClaims.sub, registered.body.user.id);
    assert.equal(accessClaims.kind, 'registered');
    assert.equal(verifyToken(registered.body.refreshToken, 'refresh').sub, registered.body.user.id);

    const stored = await query({
      table: 'users',
      action: 'select',
      filter: { email },
      queryOptions: { limit: 1 },
    });
    assert.equal(stored.rows.length, 1);
    assert.notEqual(stored.rows[0].password_hash, password);
    assert.match(stored.rows[0].password_hash, /^scrypt\$/);

    const wrong = await post(base, '/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(wrong.status, 401);

    const login = await post(base, '/api/auth/login', { email, password });
    assert.equal(login.status, 200);
    assert.equal(verifyToken(login.body.accessToken, 'access').sub, registered.body.user.id);
  });
});

test('anonymous and refresh endpoints issue only signed tokens', async () => {
  await withServer(async (base) => {
    const anonymous = await post(base, '/api/auth/anonymous', {});
    assert.equal(anonymous.status, 201);
    const claims = verifyToken(anonymous.body.accessToken, 'access');
    assert.equal(claims.sub, anonymous.body.user.id);
    assert.equal(claims.kind, 'anonymous');

    const forged = await post(base, '/api/auth/refresh', {
      refreshToken: `refresh-${anonymous.body.user.id}`,
    });
    assert.equal(forged.status, 401);

    const refreshed = await post(base, '/api/auth/refresh', {
      refreshToken: anonymous.body.refreshToken,
    });
    assert.equal(refreshed.status, 200);
    assert.equal(verifyToken(refreshed.body.accessToken, 'access').sub, anonymous.body.user.id);

    const replayed = await post(base, '/api/auth/refresh', {
      refreshToken: anonymous.body.refreshToken,
    });
    assert.equal(replayed.status, 401);

    const rotated = await post(base, '/api/auth/refresh', {
      refreshToken: refreshed.body.refreshToken,
    });
    assert.equal(rotated.status, 200);

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${rotated.body.accessToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.id, anonymous.body.user.id);
  });
});

test('anonymous account upgrade preserves the same user and all owned records', async () => {
  await withServer(async (base) => {
    const anonymous = await post(base, '/api/auth/anonymous', {});
    const userId = anonymous.body.user.id;
    await query({
      table: 'cards',
      action: 'insert',
      data: { id: `upgrade-card-${Date.now()}`, user_id: userId, title: '保留的命签' },
    });
    const email = `upgrade-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const upgraded = await post(base, '/api/auth/upgrade', {
      email,
      password: 'safe-password-123',
      nickname: '升级用户',
    }, {
      authorization: `Bearer ${anonymous.body.accessToken}`,
    });

    assert.equal(upgraded.status, 200);
    assert.equal(upgraded.body.user.id, userId);
    assert.equal(upgraded.body.user.anonymous, false);
    assert.equal(upgraded.body.user.email, email);
    assert.equal(verifyToken(upgraded.body.accessToken, 'access').kind, 'registered');

    const stored = await query({
      table: 'users',
      action: 'select',
      filter: { id: userId },
      queryOptions: { limit: 1 },
    });
    assert.equal(stored.rows[0].email, email);
    assert.equal(!!stored.rows[0].anonymous, false);
    assert.match(stored.rows[0].password_hash, /^scrypt\$/);

    const cards = await query({ table: 'cards', action: 'select', filter: { user_id: userId } });
    assert.equal(cards.rows.some((card) => card.title === '保留的命签'), true);
  });
});

test('account upgrade rejects registered principals and duplicate emails', async () => {
  await withServer(async (base) => {
    const email = `duplicate-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registered = await post(base, '/api/auth/register', {
      email,
      password: 'safe-password-123',
    });
    const registeredAttempt = await post(base, '/api/auth/upgrade', {
      email: `other-${email}`,
      password: 'safe-password-123',
    }, {
      authorization: `Bearer ${registered.body.accessToken}`,
    });
    assert.equal(registeredAttempt.status, 409);
    assert.equal(registeredAttempt.body.error, 'ACCOUNT_ALREADY_REGISTERED');

    const anonymous = await post(base, '/api/auth/anonymous', {});
    const duplicateAttempt = await post(base, '/api/auth/upgrade', {
      email,
      password: 'safe-password-123',
    }, {
      authorization: `Bearer ${anonymous.body.accessToken}`,
    });
    assert.equal(duplicateAttempt.status, 409);
    assert.equal(duplicateAttempt.body.error, '该邮箱已注册');
  });
});

test('logout revokes the submitted refresh token and remains idempotent', async () => {
  await withServer(async (base) => {
    const anonymous = await post(base, '/api/auth/anonymous', {});
    const firstLogout = await post(base, '/api/auth/logout', {
      refreshToken: anonymous.body.refreshToken,
    });
    assert.equal(firstLogout.status, 200);
    const secondLogout = await post(base, '/api/auth/logout', {
      refreshToken: anonymous.body.refreshToken,
    });
    assert.equal(secondLogout.status, 200);
    const refreshed = await post(base, '/api/auth/refresh', {
      refreshToken: anonymous.body.refreshToken,
    });
    assert.equal(refreshed.status, 401);
  });
});

test('password reset consumes one token and revokes every existing refresh session', async () => {
  await withServer(async (base) => {
    const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registered = await post(base, '/api/auth/register', { email, password: 'old-password-123' });
    const issued = await createAccountActionToken({ userId: registered.body.user.id, purpose: 'reset_password' });
    const reset = await post(base, '/api/auth/reset-password', { token: issued.token, password: 'new-password-456' });
    assert.equal(reset.status, 200);
    assert.equal((await post(base, '/api/auth/login', { email, password: 'old-password-123' })).status, 401);
    assert.equal((await post(base, '/api/auth/login', { email, password: 'new-password-456' })).status, 200);
    assert.equal((await post(base, '/api/auth/refresh', { refreshToken: registered.body.refreshToken })).status, 401);
    assert.equal((await post(base, '/api/auth/reset-password', { token: issued.token, password: 'another-password-789' })).status, 400);
  });
});

test('registered users can change a known password and email verification is one-time', async () => {
  await withServer(async (base) => {
    const email = `secure-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registered = await post(base, '/api/auth/register', { email, password: 'old-password-123' });
    const authorization = { authorization: `Bearer ${registered.body.accessToken}` };
    assert.equal((await post(base, '/api/auth/change-password', { currentPassword: 'wrong-password', password: 'new-password-456' }, authorization)).status, 401);
    assert.equal((await post(base, '/api/auth/change-password', { currentPassword: 'old-password-123', password: 'new-password-456' }, authorization)).status, 200);
    assert.equal((await post(base, '/api/auth/refresh', { refreshToken: registered.body.refreshToken })).status, 401);

    const verification = await createAccountActionToken({ userId: registered.body.user.id, purpose: 'verify_email' });
    const verified = await post(base, '/api/auth/verify-email', { token: verification.token });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.emailVerified, true);
    assert.equal((await post(base, '/api/auth/verify-email', { token: verification.token })).status, 400);
  });
});

test('public auth capabilities expose availability without leaking provider secrets', async () => {
  await withServer(async (base) => {
    const previous = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'must-not-leak';
    try {
      const response = await fetch(`${base}/api/auth/capabilities`);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(JSON.stringify(body).includes('must-not-leak'), false);
      assert.equal(typeof body.providers.email.enabled, 'boolean');
      assert.equal(typeof body.providers.wechat.enabled, 'boolean');
    } finally {
      if (previous === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous;
    }
  });
});

test('authenticated users can update only validated public profile fields', async () => {
  await withServer(async (base) => {
    const email = `profile-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const registered = await post(base, '/api/auth/register', {
      email,
      password: 'safe-password-123',
      nickname: '旧昵称',
    });
    const avatar = 'data:image/webp;base64,AAAA';
    const updated = await patch(base, '/api/auth/me', {
      nickname: '新昵称',
      avatar,
      color: '#5078A8',
      bio: '愿每次决策都有证据。',
      email: 'cannot-change@example.test',
      anonymous: true,
    }, {
      authorization: `Bearer ${registered.body.accessToken}`,
    });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.user.id, registered.body.user.id);
    assert.equal(updated.body.user.email, email);
    assert.equal(updated.body.user.anonymous, false);
    assert.equal(updated.body.user.nickname, '新昵称');
    assert.equal(updated.body.user.avatar, avatar);
    assert.equal(updated.body.user.color, '#5078A8');
    assert.equal(updated.body.user.bio, '愿每次决策都有证据。');

    const stored = await query({
      table: 'users',
      action: 'select',
      filter: { id: registered.body.user.id },
      queryOptions: { limit: 1 },
    });
    assert.equal(stored.rows[0].nickname, '新昵称');
    assert.equal(stored.rows[0].email, email);
    assert.equal(!!stored.rows[0].anonymous, false);
  });
});

test('profile update rejects missing authentication and invalid uploaded avatars', async () => {
  await withServer(async (base) => {
    const unauthorized = await patch(base, '/api/auth/me', { nickname: '越权修改' });
    assert.equal(unauthorized.status, 401);

    const anonymous = await post(base, '/api/auth/anonymous', {});
    const invalidAvatar = await patch(base, '/api/auth/me', {
      avatar: 'data:image/gif;base64,AAAA',
    }, {
      authorization: `Bearer ${anonymous.body.accessToken}`,
    });
    assert.equal(invalidAvatar.status, 400);
    assert.equal(invalidAvatar.body.error, 'INVALID_AVATAR');
  });
});
