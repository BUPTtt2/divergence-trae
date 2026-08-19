import test from 'node:test';
import assert from 'node:assert/strict';

import { getExternalProviderCapabilities } from '../src/services/externalProviderRegistry.js';

test('external providers stay disabled until every required server setting exists', () => {
  const disabled = getExternalProviderCapabilities({});
  assert.equal(disabled.email.enabled, false);
  assert.equal(disabled.payment.enabled, false);
  assert.equal(disabled.wechat.enabled, false);
  assert.equal(disabled.qq.enabled, false);
  assert.equal(JSON.stringify(disabled).includes('secret-value'), false);

  const enabled = getExternalProviderCapabilities({
    RESEND_API_KEY: 'secret-value', AUTH_EMAIL_FROM: '演策 <hello@example.com>', PUBLIC_APP_URL: 'https://example.com',
    PAYMENT_PROVIDER: 'verified_provider', PAYMENT_API_KEY: 'secret-value', PAYMENT_WEBHOOK_SECRET: 'secret-value',
    WECHAT_CLIENT_ID: 'id', WECHAT_CLIENT_SECRET: 'secret-value', WECHAT_REDIRECT_URI: 'https://example.com/auth/wechat',
    QQ_CLIENT_ID: 'id', QQ_CLIENT_SECRET: 'secret-value', QQ_REDIRECT_URI: 'https://example.com/auth/qq',
  });
  assert.deepEqual(Object.values(enabled).map((item) => item.enabled), [true, false, false, false]);
  assert.equal(enabled.payment.reason, 'PAYMENT_PROVIDER_ADAPTER_NOT_IMPLEMENTED');
  assert.equal(enabled.wechat.reason, 'WECHAT_OAUTH_CALLBACK_NOT_IMPLEMENTED');
  assert.equal(enabled.qq.reason, 'QQ_OAUTH_CALLBACK_NOT_IMPLEMENTED');
  assert.equal(JSON.stringify(enabled).includes('secret-value'), false);
});
