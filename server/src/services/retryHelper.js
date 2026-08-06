/**
 * 通用重试工具
 * 原则：不用预设文案假装在工作；要么重试，要么报错说明原因
 */

import logger from './logger.js';

/**
 * 带重试的异步执行
 * @param {Function} fn - 异步函数
 * @param {object} opts - { retries: 2, delayMs: 1000, backoffMs: 2000, name: 'operation' }
 * @returns {Promise<any>} fn 的返回值
 * @throws {Error} 重试耗尽后抛出最后一个错误
 */
export async function withRetry(fn, opts = {}) {
  const {
    retries = 2,
    delayMs = 1000,
    backoffMs = 2000,
    name = 'operation',
  } = opts;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info(`[Retry] ${name} 第${attempt}次重试成功`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const wait = attempt === 0 ? delayMs : backoffMs;
        logger.warn(`[Retry] ${name} 第${attempt + 1}次失败: ${err.message}，${wait}ms后重试`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        logger.error(`[Retry] ${name} 重试耗尽（${retries + 1}次）：${err.message}`);
      }
    }
  }
  throw lastError;
}

/**
 * 带超时的异步执行
 * @param {Function} fn - 异步函数
 * @param {number} timeoutMs - 超时毫秒
 * @param {string} name - 操作名称（用于错误信息）
 * @returns {Promise<any>} fn 的返回值
 * @throws {Error} 超时抛出 { message: '${name}超时', type: 'LLM_TIMEOUT' }
 */
export function withTimeout(fn, timeoutMs, name = 'operation') {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error(`${name}超时`), { type: 'LLM_TIMEOUT' })), timeoutMs)
    ),
  ]);
}
