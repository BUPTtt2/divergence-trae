import { query } from './db.js';
import { normalizeProductEvent } from './productAnalytics.js';

export async function recordSecurityTelemetry(input = {}, options = {}) {
  const event = normalizeProductEvent({
    event: input.event,
    properties: input.properties,
  }, {
    principalId: input.principalId || 'security-public',
  });
  if (!event) return null;
  try {
    await (options.queryImpl || query)({ table: 'product_events', action: 'insert', data: event });
    return event;
  } catch {
    return null;
  }
}

export default recordSecurityTelemetry;
