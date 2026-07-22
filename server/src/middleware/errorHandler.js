/**
 * 统一错误处理中间件
 * 捕获所有未处理异常，返回 JSON 错误信息，不让服务崩溃
 */
export function notFound(req, res, next) {
  res.status(404).json({
    error: '路由不存在',
    path: req.originalUrl,
    method: req.method,
  });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(`[错误] ${req.method} ${req.originalUrl}:`, err.message);

  // SSE 连接出错时直接关闭
  if (res.headersSent) {
    if (typeof res.end === 'function') res.end();
    return;
  }

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // 生产环境不泄露内部错误细节
  if (status === 500) {
    res.status(500).json({
      error: '服务器内部错误',
      message: isProduction ? '请稍后重试' : err.message,
    });
  } else {
    res.status(status).json({
      error: err.message || '请求错误',
      ...( !isProduction && { stack: err.stack }),
    });
  }
}

/**
 * 异步路由包装器：自动捕获 Promise 错误
 * @param {Function} fn 异步路由处理函数
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default errorHandler;
