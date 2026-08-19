import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePassword } from '../src/services/passwordPolicy.js';

test('password policy accepts long passphrases without mandatory symbol composition', () => {
  assert.deepEqual(validatePassword('梧桐月下保持清醒2026'), { valid: true, error: null });
  assert.deepEqual(validatePassword('correct-horse-battery-staple'), { valid: true, error: null });
});

test('password policy rejects short, oversized and common passwords', () => {
  assert.equal(validatePassword('short123').error, 'PASSWORD_TOO_SHORT');
  assert.equal(validatePassword('a'.repeat(129)).error, 'PASSWORD_TOO_LONG');
  assert.equal(validatePassword('password123').error, 'PASSWORD_TOO_COMMON');
  assert.equal(validatePassword('1234567890').error, 'PASSWORD_TOO_COMMON');
});
