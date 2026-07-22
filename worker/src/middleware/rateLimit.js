/**
 * 限流中间件 — 基于 Cloudflare KV，分布式友好
 *
 * 策略：
 * - 匿名用户：按 IP 限流，60 次/分钟
 * - 登录用户：按 userId 限流，300 次/分钟
 * - 写操作（POST/PUT/DELETE）：更严格
 *
 * 健康检查、OPTIONS 预检不限流
 */

const WINDOW_SECONDS = 60;
const ANON_LIMIT = 60;
const AUTH_LIMIT = 300;
const WRITE_LIMIT_ANON = 20;
const WRITE_LIMIT_AUTH = 100;

/**
 * 限流主函数
 */
export const rateLimitMiddleware = async (c, next) => {
  // OPTIONS 预检不限流
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  // 健康检查不限流（虽然 /health 不在 /api/* 下，但保险起见）
  if (c.req.path === '/health' || c.req.path === '/api/health') {
    return next();
  }

  const ip =
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';

  const userId = c.get('userId') || null;
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(c.req.method);

  // 计算限流键和上限
  const key = userId
    ? `rl:u:${userId}:${isWrite ? 'w' : 'r'}`
    : `rl:ip:${ip}:${isWrite ? 'w' : 'r'}`;

  let limit = userId ? AUTH_LIMIT : ANON_LIMIT;
  if (isWrite) limit = userId ? WRITE_LIMIT_AUTH : WRITE_LIMIT_ANON;

  // 读 KV 当前计数
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % WINDOW_SECONDS);
  const kvKey = `${key}:${windowStart}`;

  let count = 0;
  try {
    const raw = await c.env.KV.get(kvKey);
    count = raw ? parseInt(raw, 10) : 0;
  } catch {
    // KV 读失败不阻塞，但记录警告
    console.warn('[rateLimit] KV 读失败，跳过限流');
    await next();
    return;
  }

  // 检查超限
  if (count >= limit) {
    const resetIn = WINDOW_SECONDS - (now - windowStart);
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', '0');
    c.header('X-RateLimit-Reset', String(resetIn));
    c.header('Retry-After', String(resetIn));
    return c.json(
      {
        error: 'rate_limited',
        message: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMITED',
        retryAfter: resetIn,
      },
      429
    );
  }

  // 增加计数（异步，不阻塞响应）
  count += 1;
  c.executionCtx.waitUntil(
    c.env.KV.put(kvKey, String(count), {
      expirationTtl: WINDOW_SECONDS + 5,
    })
  );

  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

  await next();
};
