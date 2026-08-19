import { getExternalProviderCapabilities } from './externalProviderRegistry.js';

function emailError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function getEmailCapability(env = process.env) {
  return getExternalProviderCapabilities(env).email;
}

export async function sendAccountActionEmail(input, options = {}) {
  const env = options.env || process.env;
  const capability = getEmailCapability(env);
  if (!capability.enabled) throw emailError('EMAIL_DELIVERY_UNAVAILABLE', '邮件验证暂未开放');
  const purpose = input.purpose === 'verify_email' ? 'verify-email' : 'reset-password';
  const subject = input.purpose === 'verify_email' ? '验证你的演策账号' : '重置你的演策密码';
  const validity = input.purpose === 'verify_email' ? '24 小时' : '30 分钟';
  const link = `${String(env.PUBLIC_APP_URL).replace(/\/$/, '')}/account/${purpose}?token=${encodeURIComponent(input.token)}`;
  const response = await (options.fetchImpl || fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [input.to],
      subject,
      text: `${subject}\n\n请在 ${validity}内打开：${link}\n\n链接仅可使用一次；新链接发出后，旧链接会立即失效。${input.expiresAt ? `\n到期时间：${input.expiresAt}` : ''}\n\n如果不是你本人操作，请忽略。`,
    }),
    signal: options.signal || AbortSignal.timeout(10000),
  });
  if (!response.ok) throw emailError('EMAIL_DELIVERY_FAILED', '邮件发送失败，请稍后重试');
  const payload = await response.json().catch(() => ({}));
  return { provider: 'resend', messageId: payload.id || null };
}

export async function sendOpsAlertEmail(input, options = {}) {
  const env = options.env || process.env;
  const capability = getEmailCapability(env);
  if (!capability.enabled) throw emailError('EMAIL_DELIVERY_UNAVAILABLE', '邮件服务暂不可用');
  const destination = String(env.OPS_ALERT_EMAIL || '').trim();
  if (!destination) throw emailError('OPS_ALERT_EMAIL_MISSING', '运营告警收件人未配置');
  const code = String(input.code || 'OPS_ALERT').trim().slice(0, 80);
  const title = String(input.title || '演策运营告警').trim().slice(0, 120);
  const summary = String(input.summary || '').trim().slice(0, 500);
  const response = await (options.fetchImpl || fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [destination],
      subject: `[演策告警] ${title}`,
      text: `${title}\n\n事件代码：${code}\n${summary}\n\n查看私有运营后台：${String(env.PUBLIC_APP_URL).replace(/\/$/, '')}/ops\n\n本邮件不包含用户问题、案卷或模型正文。`,
    }),
    signal: options.signal || AbortSignal.timeout(10000),
  });
  if (!response.ok) throw emailError('EMAIL_DELIVERY_FAILED', '运营告警邮件发送失败');
  const payload = await response.json().catch(() => ({}));
  return { provider: 'resend', messageId: payload.id || null };
}

export default sendAccountActionEmail;
