const COMMON_PASSWORDS = new Set([
  '1234567890',
  '1111111111',
  'password123',
  'qwerty12345',
  'abc1234567',
]);

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 10) return { valid: false, error: 'PASSWORD_TOO_SHORT' };
  if (value.length > 128) return { valid: false, error: 'PASSWORD_TOO_LONG' };
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return { valid: false, error: 'PASSWORD_TOO_COMMON' };
  return { valid: true, error: null };
}

export function passwordPolicyMessage(error) {
  if (error === 'PASSWORD_TOO_SHORT') return '密码至少需要 10 个字符';
  if (error === 'PASSWORD_TOO_LONG') return '密码不能超过 128 个字符';
  if (error === 'PASSWORD_TOO_COMMON') return '这个密码过于常见，请使用更长的独立口令';
  return '密码不符合安全要求';
}

export default validatePassword;
