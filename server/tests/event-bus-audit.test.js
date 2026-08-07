import test from 'node:test';
import assert from 'node:assert/strict';
import { initDB } from '../src/services/db.js';
import eventBus from '../src/services/eventBus.js';
import { getEvents } from '../src/services/eventStore.js';

initDB();

test('typed backend subscribers receive the complete EventBus event', async () => {
  const received = new Promise((resolve) => {
    const unsubscribe = eventBus.on('STATE_CHANGE', (event) => {
      unsubscribe();
      resolve(event);
    });
  });

  eventBus.emit('sess_event_bus', {
    type: 'STATE_CHANGE',
    data: { from: 'CLARIFY', to: 'EXECUTE' },
    actor: 'test',
  });

  const event = await received;
  assert.match(event.id, /^[0-9a-f-]+$/i);
  assert.equal(event.type, 'STATE_CHANGE');
  assert.equal(event.sessionId, 'sess_event_bus');
  assert.deepEqual(event.data, { from: 'CLARIFY', to: 'EXECUTE' });
  assert.equal(event.actor, 'test');
  assert.match(event.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('AuditAgent emits and persists a forbidden state transition alert', async () => {
  const { AuditAgent } = await import('../src/agents/system/AuditAgent.js');
  const audit = new AuditAgent();
  audit.ensureAttached();
  const alert = new Promise((resolve, reject) => {
    const unsubscribe = eventBus.on('AUDIT_ALERT', (event) => {
      unsubscribe();
      resolve(event);
    });
    setTimeout(() => {
      unsubscribe();
      reject(new Error('AUDIT_ALERT not emitted'));
    }, 100);
  });

  eventBus.emit('sess_audit', {
    type: 'STATE_CHANGE',
    data: { from: 'CLARIFY', to: 'EXECUTE' },
  });

  assert.equal(audit.sevCounts[2], 1);
  const alertEvent = await alert;
  assert.equal(alertEvent.sessionId, 'sess_audit');
  assert.equal(alertEvent.data.rule, 'STATE_LEAP');

  const events = await getEvents('sess_audit');
  assert.ok(events.some((event) => event.type === 'AUDIT_EVENT'));
});
