import crypto from 'crypto';

const ISSUER = 'yance-agent-runtime';
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEV_SECRET = 'yance-development-auth-secret-not-for-production';
const PLACEHOLDER_MARKERS = ['change_this', 'replace_me', 'your_secret', 'secret_key'];

function authError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function resolveSecret(explicitSecret) {
  const configured = explicitSecret
    || process.env.AUTH_TOKEN_SECRET
    || process.env.JWT_SECRET
    || process.env.SIGNING_SECRET
    || (process.env.NODE_ENV === 'production' ? '' : DEV_SECRET);
  const normalized = String(configured || '');
  const lower = normalized.toLowerCase();
  if (
    normalized.length < 32
    || PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))
  ) {
    throw authError('AUTH_NOT_CONFIGURED', 'AUTH_NOT_CONFIGURED');
  }
  return normalized;
}

function nowSeconds(value) {
  return Number.isFinite(value) ? Math.floor(value) : Math.floor(Date.now() / 1000);
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
  }
}

function sign(unsignedToken, secret) {
  return crypto.createHmac('sha256', secret).update(unsignedToken).digest('base64url');
}

function safeSignatureEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function issueToken({ userId, kind, type, ttlSeconds }, options = {}) {
  const sub = String(userId || '').trim();
  if (!sub || sub.length > 100) throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
  if (kind !== 'anonymous' && kind !== 'registered') {
    throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
  }
  const secret = resolveSecret(options.secret);
  const iat = nowSeconds(options.now);
  const header = encodeJson({ alg: 'HS256', typ: 'YANCE' });
  const payload = encodeJson({
    iss: ISSUER,
    sub,
    type,
    kind,
    iat,
    exp: iat + ttlSeconds,
    jti: crypto.randomUUID(),
  });
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

export function issueTokenPair(identity, options = {}) {
  const accessTtlSeconds = options.accessTtlSeconds || ACCESS_TTL_SECONDS;
  const refreshTtlSeconds = options.refreshTtlSeconds || REFRESH_TTL_SECONDS;
  return {
    accessToken: issueToken(
      { ...identity, type: 'access', ttlSeconds: accessTtlSeconds },
      options,
    ),
    refreshToken: issueToken(
      { ...identity, type: 'refresh', ttlSeconds: refreshTtlSeconds },
      options,
    ),
    expiresIn: accessTtlSeconds,
    refreshTokenExpiresIn: refreshTtlSeconds,
  };
}

export function verifyToken(token, expectedType, options = {}) {
  try {
    if (expectedType !== 'access' && expectedType !== 'refresh') {
      throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
    }
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
    const [encodedHeader, encodedPayload, actualSignature] = parts;
    const header = decodeJson(encodedHeader);
    if (header.alg !== 'HS256' || header.typ !== 'YANCE') {
      throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
    }
    const secret = resolveSecret(options.secret);
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    if (!safeSignatureEqual(actualSignature, sign(unsignedToken, secret))) {
      throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
    }
    const claims = decodeJson(encodedPayload);
    const now = nowSeconds(options.now);
    if (
      claims.iss !== ISSUER
      || claims.type !== expectedType
      || (claims.kind !== 'anonymous' && claims.kind !== 'registered')
      || typeof claims.sub !== 'string'
      || claims.sub.length === 0
      || claims.sub.length > 100
      || typeof claims.jti !== 'string'
      || claims.jti.length < 8
      || !Number.isFinite(claims.iat)
      || !Number.isFinite(claims.exp)
      || now >= claims.exp
      || claims.iat > now + 60
    ) {
      throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
    }
    return claims;
  } catch (error) {
    if (error?.code === 'AUTH_NOT_CONFIGURED') throw error;
    throw authError('AUTH_REQUIRED', 'AUTH_REQUIRED');
  }
}

export default { issueTokenPair, verifyToken };
