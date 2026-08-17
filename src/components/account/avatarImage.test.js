import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AVATAR_INPUT_MAX_BYTES,
  isImageAvatar,
  validateAvatarFile,
} from './avatarImage.js';

test('image avatar detection distinguishes uploaded data URLs from symbolic seals', () => {
  assert.equal(isImageAvatar('data:image/webp;base64,AAAA'), true);
  assert.equal(isImageAvatar('data:image/jpeg;base64,AAAA'), true);
  assert.equal(isImageAvatar('☯'), false);
  assert.equal(isImageAvatar('https://example.com/avatar.png'), false);
});

test('avatar file validation accepts supported images within the input limit', () => {
  assert.deepEqual(validateAvatarFile({ type: 'image/jpeg', size: AVATAR_INPUT_MAX_BYTES }), {
    ok: true,
    message: '',
  });
  assert.deepEqual(validateAvatarFile({ type: 'image/webp', size: 1024 }), {
    ok: true,
    message: '',
  });
});

test('avatar file validation rejects unsupported and oversized input', () => {
  assert.deepEqual(validateAvatarFile({ type: 'image/gif', size: 1024 }), {
    ok: false,
    message: '请选择 JPG、PNG 或 WebP 图片',
  });
  assert.deepEqual(validateAvatarFile({ type: 'image/png', size: AVATAR_INPUT_MAX_BYTES + 1 }), {
    ok: false,
    message: '图片不能超过 4 MB',
  });
});

