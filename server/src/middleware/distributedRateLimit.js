import { consumeRateLimit } from '../services/distributedRateLimitService.js';

function defaultRequestSubject(req) {
  return req.userId || req.principal?.userId || req.ip || req.socket?.remoteAddress || 'unknown';
}

export function resolveRateLimitSubject(req, options = {}) {
  const resolved = typeof options.subject === 'function' ? options.subject(req) : defaultRequestSubject(req);
  return String(resolved || 'unknown');
}

export function distributedRateLimit(options = {}) {
  const methods = new Set((options.methods || ['POST']).map((method) => String(method).toUpperCase()));
  const consume = options.consume || consumeRateLimit;
  return async function distributedRateLimitMiddleware(req, res, next) {
    if (!methods.has(req.method)) return next();
    try {
      const result = await consume({
        scope: options.scope,
        subject: resolveRateLimitSubject(req, options),
        windowSeconds: options.windowSeconds || 60,
        limit: options.limit || 30,
        cost: options.cost || 1,
      });
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.resetAt);
      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfter);
        if (typeof options.onDenied === 'function') {
          await options.onDenied(req, { scope: options.scope, retryAfter });
        }
        return res.status(429).json({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试', retryAfter });
      }
      return next();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production' && options.allowLocalFallback !== false) return next();
      return res.status(503).json({ error: 'RATE_LIMIT_UNAVAILABLE', message: '保护服务暂不可用，请稍后重试' });
    }
  };
}

export default distributedRateLimit;
