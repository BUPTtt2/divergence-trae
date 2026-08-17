import test from 'node:test';
import assert from 'node:assert/strict';

import { requestAccountProfileUpdate } from './accountProfileClient.js';

test('profile client sends only the current token and editable profile payload', async () => {
  let observed;
  const user = { id: 'user-1', nickname: '新昵称', avatar: '☯' };
  const result = await requestAccountProfileUpdate({
    apiBaseUrl: 'https://api.example.test',
    token: 'signed-access-token',
    profile: { nickname: '新昵称', avatar: '☯', color: '#5078A8', bio: '' },
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        json: async () => ({ user }),
      };
    },
  });

  assert.deepEqual(result, user);
  assert.equal(observed.url, 'https://api.example.test/api/auth/me');
  assert.equal(observed.options.method, 'PATCH');
  assert.equal(observed.options.headers.authorization, 'Bearer signed-access-token');
  assert.deepEqual(JSON.parse(observed.options.body), {
    nickname: '新昵称',
    avatar: '☯',
    color: '#5078A8',
    bio: '',
  });
});

test('profile client exposes a useful error when the server rejects an avatar', async () => {
  await assert.rejects(
    requestAccountProfileUpdate({
      apiBaseUrl: '',
      token: 'signed-access-token',
      profile: { avatar: 'data:image/gif;base64,AAAA' },
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'INVALID_AVATAR' }),
      }),
    }),
    /头像格式或大小不符合要求/,
  );
});

