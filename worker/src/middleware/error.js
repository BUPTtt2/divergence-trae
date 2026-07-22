/**
 * 错误处理中间件
 *
 * - 统一 JSON 错误格式
 * - 区分客户端错误（4xx）和服务器错误（5xx）
 * - 5xx 错误记录到审计日志
 * - 隐藏内部错误细节，避免信息泄露
 */

import { uuid } from '../utils/id.js';

/**
 * 404 处理
 */
export function notFound(c) {
  return c.json(
    {
      error: 'not_found',
      message: `路径 ${c.req.path} 不存在`,
      code: 'NOT_FOUND',
    },
    404
  );
}

/**
 * 全局错误处理
 */
export const errorHandler = (err, c) => {
  const errorId = uuid();
  const status = err.status || 500;
  const isClientError = status >= 400 && status < 500;

  // 客户端错误 — 直接返回
  if (isClientError) {
    return c.json(
      {
        error: err.code || 'bad_request',
        message: err.message || '请求参数错误',
        code: err.code || 'BAD_REQUEST',
        errorId,
      },
      status
    );
  }

  // 服务器错误 — 详细日志，简化返回
  console.error('[error]', {
    errorId,
    status,
    message: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
    userId: c.get('userId') || null,
  });

  // 写入审计日志（异步）
  if (c.env && c.env.DB) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        `INSERT INTO audit_logs (id, user_id, action, resource_type, meta) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(
          errorId,
          c.get('userId') || null,
          'server_error',
          'request',
          JSON.stringify({
            path: c.req.path,
            method: c.req.method,
            message: err.message,
          })
        )
        .run()
        .catch(() => {})
    );
  }

  return c.json(
    {
      error: 'internal_error',
      message: '服务器内部错误，请稍后重试',
      code: 'INTERNAL_ERROR',
      errorId,
    },
    500
  );
};

/**
 * 抛出 HTTP 错误的工具函数
 */
export function httpError(status, message, code = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * 常用错误工厂
 */
export const errors = {
  badRequest: (msg, code) => httpError(400, msg || '请求参数错误', code || 'BAD_REQUEST'),
  unauthorized: (msg) => httpError(401, msg || '未授权', 'UNAUTHORIZED'),
  forbidden: (msg) => httpError(403, msg || '禁止访问', 'FORBIDDEN'),
  notFound: (msg) => httpError(404, msg || '资源不存在', 'NOT_FOUND'),
  conflict: (msg) => httpError(409, msg || '资源冲突', 'CONFLICT'),
  tooMany: (msg) => httpError(429, msg || '请求过于频繁', 'RATE_LIMITED'),
  internal: (msg) => httpError(500, msg || '服务器内部错误', 'INTERNAL_ERROR'),
};
