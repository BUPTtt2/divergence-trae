/**
 * 错误分类定义
 * 每种错误类型有对应的处理策略和用户可见消息
 */

export const ERROR_TYPES = {
  LLM_TIMEOUT: {
    code: 'LLM_TIMEOUT',
    retryable: true,
    maxRetries: 2,
    userMessage: '演思考超时，正在重试...',
  },
  LLM_RATE_LIMIT: {
    code: 'LLM_RATE_LIMIT',
    retryable: true,
    maxRetries: 1,
    delayMs: 3000,
    userMessage: '系统繁忙，请稍候...',
  },
  LLM_INVALID_OUTPUT: {
    code: 'LLM_INVALID_OUTPUT',
    retryable: true,
    maxRetries: 1,
    userMessage: '演分析格式错误，正在重试...',
  },
  DB_ERROR: {
    code: 'DB_ERROR',
    retryable: false,
    userMessage: '数据存储异常，请稍后重试',
  },
  SSE_DISCONNECT: {
    code: 'SSE_DISCONNECT',
    retryable: true,
    maxRetries: 3,
    userMessage: '连接中断，正在重连...',
  },
  TOOL_ERROR: {
    code: 'TOOL_ERROR',
    retryable: true,
    maxRetries: 1,
    userMessage: '信息查询失败，正在重试...',
  },
  ALL_RETRIES_FAILED: {
    code: 'ALL_RETRIES_FAILED',
    retryable: false,
    userMessage: '推演失败，请重试',
  },
};

/**
 * 创建带类型的错误
 */
export function createError(type, message, details = {}) {
  const spec = ERROR_TYPES[type] || ERROR_TYPES.ALL_RETRIES_FAILED;
  const err = new Error(message || spec.userMessage);
  err.type = type;
  err.retryable = spec.retryable;
  err.details = details;
  return err;
}

/**
 * 根据 LLM 错误判断错误类型
 */
export function classifyLLMError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) return 'LLM_TIMEOUT';
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) return 'LLM_RATE_LIMIT';
  if (msg.includes('json') || msg.includes('parse') || msg.includes('format')) return 'LLM_INVALID_OUTPUT';
  return 'ALL_RETRIES_FAILED';
}
