/**
 * 认证中间件
 *
 * - authMiddleware: 强制鉴权（无 token 或 token 无效 → 401）
 * - optionalAuth: 可选鉴权（有 token 则验证并注入 userId，无则继续）
 *
 * Token 来源：Authorization: Bearer <jwt>
 */

import { verify, extractBearer } from '../utils/jwt.js';

/**
 * 从 Hono Context 中读取 JWT secret
 */
function getSecret(c) {
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET 未配置');
    throw new Error('服务器认证未配置');
  }
  return secret;
}

/**
 * 验证 token 并将用户信息注入 context
 */
async function attachUser(c, token) {
  if (!token) return null;
  const payload = await verify(token, getSecret(c));
  if (!payload || payload.type !== 'access') return null;

  c.set('userId', payload.sub);
  c.set('userAnonymous', payload.anonymous === 1);
  c.set('userEmail', payload.email || null);
  c.set('tokenJti', payload.jti);
  return payload;
}

/**
 * 强制鉴权中间件
 */
export const authMiddleware = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearer(authHeader);
  const payload = await attachUser(c, token);

  if (!payload) {
    return c.json(
      {
        error: 'unauthorized',
        message: '请先登录',
        code: 'AUTH_REQUIRED',
      },
      401
    );
  }

  // 检查 refresh token 是否被撤销（可选，性能考虑可省略）
  // 通常 access token 短期有效，撤销 refresh token 即可

  await next();
};

/**
 * 可选鉴权中间件 — 有 token 则解析，无则继续匿名访问
 */
export const optionalAuth = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearer(authHeader);
  if (token) {
    await attachUser(c, token);
  }
  await next();
};

/**
 * 要求已注册用户（非匿名）— 用于敏感操作
 */
export const requireRegisteredUser = async (c, next) => {
  await authMiddleware(c, async () => {
    if (c.get('userAnonymous')) {
      return c.json(
        {
          error: 'forbidden',
          message: '此操作需要注册账号',
          code: 'REGISTRATION_REQUIRED',
        },
        403
      );
    }
    await next();
  });
};
