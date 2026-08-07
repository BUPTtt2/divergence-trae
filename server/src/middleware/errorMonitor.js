/**
 * LLM 错误率告警中间件
 * - 收集 LLM 调用结果（成功/失败/超时）
 * - 每 5 分钟检查错误率
 * - 超 20% 时 console.error + 写入 server/data_store/alerts.log
 * - 不依赖外部服务，仅内存 + 文件
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALERT_LOG_PATH = join(__dirname, '..', '..', 'data_store', 'alerts.log');

const WINDOW_MS = 5 * 60 * 1000; // 5 分钟窗口
const ERROR_RATE_THRESHOLD = 0.2; // 20%
const MIN_SAMPLES = 5; // 少于 5 次不告警，避免噪声

// 最近的 LLM 调用结果记录：{ timestamp, success, errorType }
const llmResults = [];
let monitorStarted = false;

/**
 * 记录一次 LLM 调用结果（由 track.js 调用）
 * @param {Object} properties - { success, errorType, agentId, ... }
 */
export function recordLLMResult(properties) {
  if (!properties) return;
  llmResults.push({
    timestamp: Date.now(),
    success: !!properties.success,
    errorType: properties.errorType || (properties.success ? null : 'unknown'),
  });
  // 控制内存：保留最近 1 小时
  const ONE_HOUR = 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_HOUR;
  while (llmResults.length > 0 && llmResults[0].timestamp < cutoff) {
    llmResults.shift();
  }
}

/**
 * 写入告警日志（文件）
 */
async function writeAlert(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  console.error(message);
  try {
    await mkdir(dirname(ALERT_LOG_PATH), { recursive: true });
    await appendFile(ALERT_LOG_PATH, line, 'utf-8');
  } catch (e) {
    // 文件写入失败不影响运行
    console.warn('[errorMonitor] 写入 alerts.log 失败:', e.message);
  }
}

/**
 * 检查最近 5 分钟的 LLM 错误率
 */
export function checkLLMErrorRate() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = llmResults.filter((r) => r.timestamp >= cutoff);
  if (recent.length < MIN_SAMPLES) return;

  const failures = recent.filter((r) => !r.success);
  const errorRate = failures.length / recent.length;
  if (errorRate > ERROR_RATE_THRESHOLD) {
    // 错误类型分布
    const errorTypes = {};
    for (const f of failures) {
      const t = f.errorType || 'unknown';
      errorTypes[t] = (errorTypes[t] || 0) + 1;
    }
    const detail = Object.entries(errorTypes)
      .map(([t, c]) => `${t}=${c}`)
      .join(', ');
    writeAlert(
      `[LLM 告警] 最近 5 分钟错误率 ${(errorRate * 100).toFixed(1)}% (${failures.length}/${recent.length})，超过阈值 ${(ERROR_RATE_THRESHOLD * 100).toFixed(0)}%。错误分布: ${detail}`
    );
  }
}

/**
 * 启动周期性错误率检查
 */
export function startErrorMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const monitor = setInterval(() => {
    try {
      checkLLMErrorRate();
    } catch (e) {
      console.warn('[errorMonitor] 检查失败:', e.message);
    }
  }, WINDOW_MS);
  monitor.unref?.();
  console.log('[errorMonitor] 已启动，每 5 分钟检查 LLM 错误率');
}

/**
 * 手动触发一次检查（测试用）
 */
export function inspect() {
  return {
    windowMs: WINDOW_MS,
    threshold: ERROR_RATE_THRESHOLD,
    minSamples: MIN_SAMPLES,
    recentCount: llmResults.length,
  };
}

export default { recordLLMResult, startErrorMonitor, checkLLMErrorRate, inspect };
