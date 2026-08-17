export function getAuthErrorMessage(error, fallback) {
  const message = String(error?.message || '').trim();
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '连接账号服务失败，请确认代理已开启后重试';
  }
  return message || fallback;
}
