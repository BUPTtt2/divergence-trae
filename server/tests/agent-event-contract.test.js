import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { initDB, query } from '../src/services/db.js';
import eventBus from '../src/services/eventBus.js';
import BaseAgent from '../src/agents/BaseAgent.js';
import { run as runAgent } from '../src/agents/AgentRunner.js';
import {
  appendEvent,
  getEvents,
  isBrowserVisibleEvent,
  isSequenceConflict,
} from '../src/services/eventStore.js';

initDB();

async function removeEvents(events) {
  for (const event of events) {
    await query({ table: 'deliberation_events', action: 'delete', id: event.eventId });
  }
}

test('AgentEventV1 assigns a strict session sequence and complete metadata', async () => {
  const sessionId = `sess_event_contract_${Date.now()}`;
  const first = await appendEvent(sessionId, 'PLAN_CREATED', { tasks: ['compare'] }, 'planner', {
    correlationId: 'corr_plan_1',
    taskId: 'task_compare',
    visibility: 'public',
  });
  const second = await appendEvent(sessionId, 'AGENT_ASSIGNED', { agentName: '乾顾' }, 'orchestrator', {
    correlationId: 'corr_plan_1',
    causationId: first.eventId,
    taskId: 'task_compare',
    visibility: 'summary',
  });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.deepEqual(Object.keys(second).sort(), [
    'actorId', 'causationId', 'correlationId', 'createdAt', 'eventId', 'payload',
    'schemaVersion', 'sequence', 'sessionId', 'taskId', 'type', 'visibility',
  ].sort());
  assert.equal(second.schemaVersion, 1);
  assert.equal(second.actorId, 'orchestrator');
  assert.equal(second.causationId, first.eventId);
  assert.equal(second.correlationId, 'corr_plan_1');
  assert.equal(second.visibility, 'summary');
  assert.match(second.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  await removeEvents([first, second]);
});

test('cursor reads return only newer browser-visible events', async () => {
  const sessionId = `sess_event_cursor_${Date.now()}`;
  const first = await appendEvent(sessionId, 'PLAN_CREATED', {}, 'planner', {
    correlationId: 'corr_cursor',
    visibility: 'public',
  });
  const internal = await appendEvent(sessionId, 'AUDIT_FAILED', { rawPrompt: 'secret' }, 'audit', {
    correlationId: 'corr_cursor',
    visibility: 'internal',
  });
  const third = await appendEvent(sessionId, 'UNKNOWN_IDENTIFIED', { field: 'budget' }, 'planner', {
    correlationId: 'corr_cursor',
    visibility: 'summary',
  });

  const visible = await getEvents(sessionId, { afterSequence: first.sequence, browserVisibleOnly: true });
  assert.deepEqual(visible.map((event) => event.eventId), [third.eventId]);
  assert.equal(isBrowserVisibleEvent(internal), false);
  assert.equal(isBrowserVisibleEvent(third), true);

  await removeEvents([first, internal, third]);
});

test('EventBus persists once and publishes the persisted event', async () => {
  const sessionId = `sess_event_bus_v1_${Date.now()}`;
  const received = new Promise((resolve) => {
    const unsubscribe = eventBus.on('PLAN_CREATED', (event) => {
      unsubscribe();
      resolve(event);
    });
  });

  const published = await eventBus.emit(sessionId, {
    type: 'PLAN_CREATED',
    data: { tasks: ['research'] },
    actor: 'planner',
    correlationId: 'corr_bus_1',
    visibility: 'public',
  });
  const observed = await received;
  const stored = await getEvents(sessionId);

  assert.equal(observed.eventId, published.eventId);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].eventId, published.eventId);

  await removeEvents(stored);
  eventBus.cleanup(sessionId);
});

test('SSE replay respects the sequence cursor and never exposes internal events', async () => {
  const sessionId = `sess_event_replay_${Date.now()}`;
  const first = await eventBus.emit(sessionId, {
    type: 'PLAN_CREATED', data: {}, actor: 'planner', visibility: 'public', correlationId: 'corr_replay',
  });
  const internal = await eventBus.emit(sessionId, {
    type: 'AUDIT_FAILED', data: { rawPrompt: 'hidden' }, actor: 'audit', visibility: 'internal', correlationId: 'corr_replay',
  });
  const summary = await eventBus.emit(sessionId, {
    type: 'UNKNOWN_IDENTIFIED', data: { field: 'deadline' }, actor: 'planner', visibility: 'summary', correlationId: 'corr_replay',
  });
  const writes = [];
  const response = { write: (chunk) => writes.push(chunk) };

  await eventBus.subscribe(sessionId, response, { afterSequence: first.sequence });

  assert.equal(writes.length, 2);
  assert.match(writes[0], new RegExp(`^id: ${summary.sequence}\\n`));
  assert.match(writes[0], /UNKNOWN_IDENTIFIED/);
  assert.doesNotMatch(writes[0], /rawPrompt|AUDIT_FAILED/);
  assert.match(writes[1], /REPLAY_COMPLETE/);
  assert.match(writes[1], new RegExp(`"lastSequence":${summary.sequence}`));

  eventBus.unsubscribe(sessionId, response);
  await removeEvents([first, internal, summary]);
  eventBus.cleanup(sessionId);
});

test('AgentRunner publishes lifecycle domain events instead of private audit names', async () => {
  class EventAgent extends BaseAgent {
    constructor() { super({ id: 'event-agent', name: '事件智囊', role: 'advisor', retries: 0 }); }
    async _execute() { return { finding: 'ok' }; }
  }
  const sessionId = `sess_agent_lifecycle_${Date.now()}`;

  await runAgent(new EventAgent(), {
    sessionId,
    userId: 'user_event_test',
    actionId: `action_${Date.now()}`,
    round: 1,
  });
  const events = await getEvents(sessionId);

  assert.deepEqual(events.map((event) => event.type), ['AGENT_STARTED', 'AGENT_COMPLETED']);
  assert.equal(events.every((event) => event.actorId === 'event-agent'), true);
  assert.equal(events.every((event) => event.correlationId.startsWith('cid_')), true);

  await removeEvents(events);
});

test('cursor replay reads the newest event window for long-running sessions', async () => {
  const sessionId = `sess_long_replay_${Date.now()}`;
  for (let index = 1; index <= 205; index += 1) {
    await appendEvent(sessionId, 'PLAN_CREATED', { index }, 'planner', { visibility: 'public' });
  }

  const events = await getEvents(sessionId, { afterSequence: 200, browserVisibleOnly: true });
  assert.deepEqual(events.map((event) => event.sequence), [201, 202, 203, 204, 205]);
});

test('AgentEventV1 migration keeps historical reasoning events internal', () => {
  const migration = fs.readFileSync(new URL('../src/migrations/010-agent-event-v1.sql', import.meta.url), 'utf8');
  assert.match(migration, /WHEN type IN \('THOUGHT', 'ACTION', 'REACT_THINK', 'REACT_ACT', 'REACT_OBSERVE', 'AUDIT_EVENT'\) THEN 'internal'/);
  assert.doesNotMatch(migration, /SET visibility = COALESCE\(visibility, 'public'\)/);
});

test('SSE replay pages through every event after a distant cursor', async () => {
  const sessionId = `sess_full_replay_${Date.now()}`;
  for (let index = 1; index <= 205; index += 1) {
    await appendEvent(sessionId, 'PLAN_CREATED', { index }, 'planner', { visibility: 'public' });
  }
  const chunks = [];
  const response = { write: (chunk) => chunks.push(chunk) };
  await eventBus.subscribe(sessionId, response, { afterSequence: 0 });
  eventBus.unsubscribe(sessionId, response);

  const sequences = chunks
    .flatMap((chunk) => [...chunk.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1])));
  assert.equal(sequences.length, 205);
  assert.equal(sequences[0], 1);
  assert.equal(sequences.at(-1), 205);
});

test('only the session-sequence unique constraint is retryable', () => {
  assert.equal(isSequenceConflict({ code: '23505', constraint: 'idx_events_session_sequence' }), true);
  assert.equal(isSequenceConflict({ code: '23505', constraint: 'deliberation_events_pkey' }), false);
  assert.equal(isSequenceConflict({ code: 'ECONNRESET' }), false);
});
