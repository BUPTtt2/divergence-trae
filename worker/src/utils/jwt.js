/**
 * JWT 工具（HS256，基于 Web Crypto API）
 *
 * 双令牌机制：
 * - access token: 短期（15分钟），用于 API 鉴权
 * - refresh token: 长期（30天），用于换取新 access token
 *
 * 安全特性：
 * - HS256 签名（Secret 来自 Workers Secrets）
 * - iat/nbf/exp 标准声明
 * - jti 唯一ID（用于撤销）
 * - 类型字段区分 access/refresh
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const ACCESS_TOKEN_TTL = 15 * 60;          // 15 分钟
const REFRESH_TOKEN_TTL = 30 * 24 * 3600;  // 30 天

/**
 * Base64URL 编码（Uint8Array → string）
 */
function base64UrlEncode(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64URL 解码（string → Uint8Array）
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 导入 HMAC 密钥
 */
async function getKey(secret, usage) {
  return crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

/**
 * 计算字符串的 SHA-256 哈希（用于 refresh token 指纹存储）
 */
export async function sha256Hex(text) {
  const data = ENCODER.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成 access token
 * @param {Object} user - { id, anonymous, email }
 * @param {string} secret - HS256 secret
 * @returns {Promise<{token: string, expiresIn: number}>}
 */
export async function signAccessToken(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    type: 'access',
    anonymous: user.anonymous ? 1 : 0,
    email: user.email || null,
    iat: now,
    nbf: now,
    exp: now + ACCESS_TOKEN_TTL,
    jti: crypto.randomUUID(),
  };
  const token = await sign(payload, secret);
  return { token, expiresIn: ACCESS_TOKEN_TTL };
}

/**
 * 生成 refresh token
 * @param {Object} user
 * @param {string} secret
 * @returns {Promise<{token: string, jti: string, tokenHash: string, expiresIn: number}>}
 */
export async function signRefreshToken(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const payload = {
    sub: user.id,
    type: 'refresh',
    iat: now,
    nbf: now,
    exp: now + REFRESH_TOKEN_TTL,
    jti,
  };
  const token = await sign(payload, secret);
  const tokenHash = await sha256Hex(token);
  return { token, jti, tokenHash, expiresIn: REFRESH_TOKEN_TTL };
}

/**
 * 签名 JWT
 */
async function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(ENCODER.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(ENCODER.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(signingInput));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));

  return `${signingInput}.${sigB64}`;
}

/**
 * 验证并解析 JWT
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<Object|null>} 解析后的 payload，验证失败返回 null
 */
export async function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  // 验证签名
  const key = await getKey(secret, 'verify');
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, ENCODER.encode(signingInput));
  if (!valid) return null;

  // 解析 payload
  let payload;
  try {
    payload = JSON.parse(DECODER.decode(base64UrlDecode(payloadB64)));
  } catch {
    return null;
  }

  // 时间校验
  const now = Math.floor(Date.now() / 1000);
  if (payload.nbf && now < payload.nbf) return null;
  if (payload.exp && now >= payload.exp) return null;

  return payload;
}

/**
 * 从 Authorization 头提取 token
 */
export function extractBearer(header) {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export const TOKEN_TTL = {
  ACCESS: ACCESS_TOKEN_TTL,
  REFRESH: REFRESH_TOKEN_TTL,
};
