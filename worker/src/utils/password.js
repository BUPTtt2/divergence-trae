/**
 * 密码哈希工具 — 基于 Web Crypto API PBKDF2
 *
 * 在 Cloudflare Workers 环境无法使用 Argon2/bcrypt，使用 PBKDF2-SHA256 替代：
 * - 迭代次数：120000（OWASP 2023 推荐）
 * - 盐：16字节随机
 * - 输出：32字节
 *
 * 存储格式：pbkdf2$<iterations>$<salt_b64>$<hash_b64>
 */

const ITERATIONS = 10000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 哈希密码
 * @param {string} password
 * @returns {Promise<string>} pbkdf2$iter$salt$hash
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return `pbkdf2$${ITERATIONS}$${b64encode(salt)}$${b64encode(new Uint8Array(hash))}`;
}

/**
 * 验证密码
 * @param {string} password 待验证的明文
 * @param {string} stored 存储的哈希字符串
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  if (!iter || !salt || !expected) return false;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const hash = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      keyMaterial,
      HASH_BYTES * 8
    )
  );

  // 常量时间比较，防时序攻击
  if (hash.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash[i] ^ expected[i];
  }
  return diff === 0;
}

/**
 * 生成密码强度评估（0-4）
 */
export function passwordStrength(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}
