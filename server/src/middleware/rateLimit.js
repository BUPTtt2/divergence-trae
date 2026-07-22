/**
 * 分级限流中间件
 * - 全局限流：每 IP 每分钟 30 次
 * - LLM 接口限流：每 IP 每分钟 5 次
 * 用内存 Map 实现，适用于单实例部署
 */

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;
const LLM_MAX_REQUESTS = 5;

// 普通限流
const ipMap = new Map();
// LLM 限流
const llmIpMap = new Map();

function cleanup() {
  const now = Date.now();
  for (const [ip, record] of ipMap.entries()) {
    if (now - record.startTime > WINDOW_MS) ipMap.delete(ip);
  }
  for (const [ip, record] of llmIpMap.entries()) {
    if (now - record.startTime > WINDOW_MS) llmIpMap.delete(ip);
  }
}

setInterval(cleanup, WINDOW_MS);

function checkLimit(map, ip, max) {
  const now = Date.now();
  let record = map.get(ip);
  if (!record || now - record.startTime > WINDOW_MS) {
    record = { startTime: now, count: 0 };
    map.set(ip, record);
  }
  record.count += 1;
  if (record.count > max) {
    return Math.ceil((WINDOW_MS - (now - record.startTime)) / 1000);
  }
  return 0;
}

/**
 * 全局限流中间件
 */
export default function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const retryAfter = checkLimit(ipMap, ip, MAX_REQUESTS);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: '请求过于频繁',
      message: `每分钟限 ${MAX_REQUESTS} 次请求，请 ${retryAfter} 秒后重试`,
      retryAfter,
    });
  }
  next();
}

/**
 * LLM 接口限流中间件（更严格）
 */
export function llmRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const retryAfter = checkLimit(llmIpMap, ip, LLM_MAX_REQUESTS);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'LLM 接口请求过于频繁',
      message: `AI 分析每分钟限 ${LLM_MAX_REQUESTS} 次，请 ${retryAfter} 秒后重试`,
      retryAfter,
    });
  }
  next();
}
