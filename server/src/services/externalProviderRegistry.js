function capability(provider, requirements, env) {
  const missing = requirements.filter((name) => !String(env[name] || '').trim());
  return {
    enabled: missing.length === 0,
    provider,
    reason: missing.length > 0 ? `${missing.join('_AND_')}_MISSING` : null,
  };
}

export function getExternalProviderCapabilities(env = process.env) {
  return {
    email: capability('resend', ['RESEND_API_KEY', 'AUTH_EMAIL_FROM', 'PUBLIC_APP_URL'], env),
    payment: { enabled: false, provider: String(env.PAYMENT_PROVIDER || 'unconfigured'), reason: 'PAYMENT_PROVIDER_ADAPTER_NOT_IMPLEMENTED' },
    wechat: { enabled: false, provider: 'wechat_open_platform', reason: 'WECHAT_OAUTH_CALLBACK_NOT_IMPLEMENTED' },
    qq: { enabled: false, provider: 'qq_connect', reason: 'QQ_OAUTH_CALLBACK_NOT_IMPLEMENTED' },
  };
}

export default getExternalProviderCapabilities;
