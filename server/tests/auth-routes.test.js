import test from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';
import { query } from '../src/services/db.js';
import { verifyToken } from '../src/services/authTokenService.js';

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

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${refreshed.body.accessToken}` },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.id, anonymous.body.user.id);
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
