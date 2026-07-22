/**
 * 通用工具函数
 */

/**
 * 生成 UUID v4
 */
export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 获取当前时间戳（ISO 字符串）
 */
export function now() {
  return new Date().toISOString();
}

/**
 * 获取当前日期（YYYY-MM-DD，本地时区）
 */
export function today(timezone = 'Asia/Hong_Kong') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * 安全 JSON 解析
 */
export function safeJsonParse(str, fallback = null) {
  if (!str || typeof str !== 'string') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * 安全 JSON 序列化（处理循环引用、BigInt）
 */
export function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
  } catch {
    return '{}';
  }
}

/**
 * 验证 email 格式
 */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 验证 UUID 格式
 */
export function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * 客户端 IP 提取（CF 特殊头）
 */
export function getClientIp(c) {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    'unknown'
  );
}

/**
 * 用户代理
 */
export function getUserAgent(c) {
  return c.req.header('User-Agent') || '';
}

/**
 * 分页参数解析
 */
export function parsePagination(c) {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/**
 * 写入审计日志
 */
export async function audit(c, action, resourceType = null, resourceId = null, meta = {}) {
  try {
    const id = uuid();
    const userId = c.get('userId') || null;
    const ip = getClientIp(c);
    const ua = getUserAgent(c);
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, ip, user_agent, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, action, resourceType, resourceId, ip, ua, JSON.stringify(meta)).run();
  } catch (e) {
    // 审计日志失败不阻塞主流程
    console.warn('[audit] 写入失败:', e.message);
  }
}
