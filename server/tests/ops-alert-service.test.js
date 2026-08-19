import test from 'node:test';
import assert from 'node:assert/strict';

import { sendOpsAlertEmail } from '../src/services/emailDeliveryService.js';

test('ops alerts require a private destination and never include user content', async () => {
  let request;
  const result = await sendOpsAlertEmail({
    code: 'LLM_ERROR_RATE_HIGH',
    title: '模型错误率过高',
    summary: '5 分钟内 3/10 次失败',
    privateContent: '用户原始问题',
  }, {
    env: {
      RESEND_API_KEY: 'secret', AUTH_EMAIL_FROM: '演策 <account@example.com>',
      PUBLIC_APP_URL: 'https://yanceai.online', OPS_ALERT_EMAIL: 'ops@example.com',
    },
    fetchImpl: async (_url, init) => { request = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'mail-1' }) }; },
  });
  assert.equal(result.messageId, 'mail-1');
  assert.deepEqual(request.to, ['ops@example.com']);
  assert.equal(request.text.includes('LLM_ERROR_RATE_HIGH'), true);
  assert.equal(request.text.includes('用户原始问题'), false);
});

test('ops alerts stay disabled without an explicit destination', async () => {
  await assert.rejects(() => sendOpsAlertEmail({ code: 'TEST', title: '测试', summary: '测试' }, {
    env: { RESEND_API_KEY: 'secret', AUTH_EMAIL_FROM: '演策 <account@example.com>', PUBLIC_APP_URL: 'https://yanceai.online' },
  }), (error) => error.code === 'OPS_ALERT_EMAIL_MISSING');
});
