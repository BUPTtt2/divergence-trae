import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInfrastructureStatus } from '../src/services/infrastructureStatusService.js';

test('infrastructure status is operationally useful and contains no secret values', () => {
  const status = buildInfrastructureStatus({
    DATABASE_URL: 'postgres://secret-value', RATE_LIMIT_HASH_SECRET: 'secret-value', BLOB_READ_WRITE_TOKEN: 'secret-value',
    ARK_API_KEY: 'secret-value', SEEDREAM_MODEL: 'model-primary', SEEDREAM_FALLBACK_MODELS: 'model-a,model-b,model-c',
    RESEND_API_KEY: 'secret-value', AUTH_EMAIL_FROM: 'hello@example.com', PUBLIC_APP_URL: 'https://example.com',
  });
  assert.equal(status.database.enabled, true);
  assert.equal(status.artworkStorage.enabled, true);
  assert.equal(status.distributedRateLimit.enabled, true);
  assert.equal(status.seedream.enabled, true);
  assert.equal(status.seedream.modelCount, 4);
  assert.equal(status.providers.email.enabled, true);
  assert.equal(status.providers.payment.enabled, false);
  assert.equal(JSON.stringify(status).includes('secret-value'), false);
  assert.equal(JSON.stringify(status).includes('postgres://'), false);
});
