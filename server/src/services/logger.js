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

  console.log(`${color}[${level}]${reset} ${timestamp} ${message}${metaStr}`);
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
