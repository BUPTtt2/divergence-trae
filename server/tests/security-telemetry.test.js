import test from 'node:test';
import assert from 'node:assert/strict';

import { recordSecurityTelemetry } from '../src/services/securityTelemetryService.js';

test('security telemetry persists only allowlisted operational fields', async () => {
  let written = null;
  const result = await recordSecurityTelemetry({
    event: 'security_rate_limited',
    principalId: 'security-public',
    properties: {
      scope: 'password_reset_email_hour',
      retryAfter: 60,
      email: 'private@example.com',
      token: 'secret',
    },
  }, {
    queryImpl: async (operation) => { written = operation; return { rows: [operation.data] }; },
  });

  assert.equal(result.event_name, 'security_rate_limited');
  assert.deepEqual(result.properties, { scope: 'password_reset_email_hour', retryAfter: 60 });
  assert.equal(written.table, 'product_events');
  assert.equal(JSON.stringify(written).includes('private@example.com'), false);
  assert.equal(JSON.stringify(written).includes('secret'), false);
});

test('security telemetry ignores unsupported event names', async () => {
  let writes = 0;
  const result = await recordSecurityTelemetry({ event: 'raw_security_dump', principalId: 'security-public' }, {
    queryImpl: async () => { writes += 1; },
  });
  assert.equal(result, null);
  assert.equal(writes, 0);
});
