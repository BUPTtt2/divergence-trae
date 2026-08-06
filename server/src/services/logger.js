import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LEVELS.INFO;

const COLORS = {
  DEBUG: '\x1b[36m',
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  RESET: '\x1b[0m',
};

// ===== 日志文件配置 =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGS_DIR = join(__dirname, '../../logs');

// 确保日志目录存在
if (!existsSync(LOGS_DIR)) {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
  } catch (e) {
    // 目录创建失败不阻断运行，仅控制台告警
    console.warn(`[Logger] 创建日志目录失败: ${e.message}`);
  }
}

function getLogFile() {
  const today = new Date().toISOString().split('T')[0];
  return join(LOGS_DIR, `deliberation-${today}.log`);
}

function getErrorLogFile() {
  const today = new Date().toISOString().split('T')[0];
  return join(LOGS_DIR, `error-${today}.log`);
}

function writeToFile(filePath, line) {
  try {
    appendFileSync(filePath, line + '\n', 'utf8');
  } catch (e) {
    // 文件写入失败不阻断运行
  }
}

function shouldLog(level) {
  return LEVELS[level] >= LOG_LEVEL;
}

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const color = COLORS[level];
  const reset = COLORS.RESET;

  const metaStr = Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : '';

  const logLine = {
    timestamp,
    level,
    message,
    ...meta,
  };

  // 控制台输出
  console.log(`${color}[${level}]${reset} ${timestamp} ${message}${metaStr}`);

  // 文件输出（所有级别写主日志文件，ERROR/WARN 额外写错误文件）
  const fileLine = `[${timestamp}] [${level}] ${message}${metaStr}`;
  writeToFile(getLogFile(), fileLine);
  if (level === 'ERROR' || level === 'WARN') {
    writeToFile(getErrorLogFile(), fileLine);
  }

  return logLine;
}

export function debug(message, meta = {}) {
  if (!shouldLog('DEBUG')) return;
  return formatMessage('DEBUG', message, meta);
}

export function info(message, meta = {}) {
  if (!shouldLog('INFO')) return;
  return formatMessage('INFO', message, meta);
}

export function warn(message, meta = {}) {
  if (!shouldLog('WARN')) return;
  return formatMessage('WARN', message, meta);
}

export function error(message, meta = {}) {
  if (!shouldLog('ERROR')) return;
  return formatMessage('ERROR', message, meta);
}

export function logRequest(req) {
  if (!shouldLog('DEBUG')) return;
  const { method, url, headers, query, body } = req;
  const userId = headers['x-user-id'] || headers['X-User-Id'];
  
  formatMessage('DEBUG', `Request: ${method} ${url}`, {
    userId,
    query: Object.keys(query || {}).length > 0 ? query : undefined,
    bodySize: body ? JSON.stringify(body).length : 0,
  });
}

export function logError(error, context = {}) {
  formatMessage('ERROR', error.message || String(error), {
    stack: error.stack?.slice(0, 500),
    ...context,
  });
}

export function logResponse(req, res, duration) {
  if (!shouldLog('DEBUG')) return;
  const { method, url } = req;
  formatMessage('DEBUG', `Response: ${method} ${url} -> ${res.statusCode} (${duration}ms)`);
}

export default { debug, info, warn, error, logRequest, logError, logResponse };
