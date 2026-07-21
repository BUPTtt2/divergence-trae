import crypto from 'crypto';

const SIGNING_SECRET = process.env.SIGNING_SECRET || 'yance_bagua_secret_key_change_this_in_production';
const SIGNATURE_TTL = 60000;

function createHmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function extractUserIdFromBearer(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    if (token.startsWith('local-')) {
      return token.replace('local-', '');
    }
  }
  return null;
}

function extractUserId(req) {
  const bearerId = extractUserIdFromBearer(req);
  if (bearerId) return bearerId;
  return req.headers['x-user-id'] || req.body?.userId || null;
}

export function validateSignature(req) {
  const userId = extractUserId(req);
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];

  if (!userId || !signature || !timestamp || !nonce) {
    return { valid: false, reason: '缺少签名信息' };
  }

  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);

  if (isNaN(reqTime) || Math.abs(now - reqTime) > SIGNATURE_TTL) {
    return { valid: false, reason: '请求已过期' };
  }

  const expectedSignature = createHmac(SIGNING_SECRET, `${userId}:${timestamp}:${nonce}`);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { valid: false, reason: '签名无效' };
  }

  return { valid: true };
}

export function requireUser(req, res, next) {
  const userId = extractUserId(req);
  if (!userId || typeof userId !== 'string' || userId.length > 100) {
    return res.status(401).json({ error: '未登录', message: '缺少有效的用户标识' });
  }

  if (process.env.NODE_ENV === 'production') {
    const sigResult = validateSignature(req);
    if (!sigResult.valid) {
      return res.status(401).json({ error: '认证失败', message: sigResult.reason });
    }
  }

  req.userId = userId;
  next();
}

export function optionalAuth(req, res, next) {
  const userId = extractUserId(req);
  if (userId && typeof userId === 'string' && userId.length <= 100) {
    if (process.env.NODE_ENV === 'production') {
      const sigResult = validateSignature(req);
      if (!sigResult.valid) {
        console.warn('[auth] 签名验证失败，但允许匿名访问:', sigResult.reason);
        req.userId = null;
      } else {
        req.userId = userId;
      }
    } else {
      req.userId = userId;
    }
  } else {
    req.userId = null;
  }
  next();
}

export function publicAuth(req, res, next) {
  req.userId = null;
  next();
}

export function requireOwner(paramName) {
  return (req, res, next) => {
    const userId = extractUserId(req);
    if (!userId) {
      return res.status(401).json({ error: '未登录', message: '缺少有效的用户标识' });
    }

    if (process.env.NODE_ENV === 'production') {
      const sigResult = validateSignature(req);
      if (!sigResult.valid) {
        return res.status(401).json({ error: '认证失败', message: sigResult.reason });
      }
    }

    req.userId = userId;
    if (typeof userId !== 'string' || userId.length > 100) {
      return res.status(401).json({ error: '无效的用户标识' });
    }
    next();
  };
}

export default { requireUser, requireOwner, optionalAuth, validateSignature };
