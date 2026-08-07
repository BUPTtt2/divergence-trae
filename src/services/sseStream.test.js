import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceSseCursor,
  readStoredSseCursor,
  writeStoredSseCursor,
  openAuthenticatedSse,
  parseSseFrames,
} from './sseStream.js';

test('split SSE chunks produce one event and preserve the remainder', () => {
  const first = parseSseFrames('data: {"type":"CON');
  assert.deepEqual(first.events, []);

  const second = parseSseFrames(`${first.remainder}NECTED","data":{}}\n\npartial`);
  assert.deepEqual(second.events, [{ type: 'CONNECTED', data: {} }]);
  assert.equal(second.remainder, 'partial');
});

test('authenticated SSE sends bearer token and decodes streamed events', async () => {
  const requests = [];
  const events = [];
  const encoder = new TextEncoder();
  const fetchImpl = async (url, init) => {
    requests.push({ url, authorization: init.headers.Authorization });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"THOU'));
        controller.enqueue(encoder.encode('GHT","data":{"step":"plan"}}\n\n'));
        controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const stream = openAuthenticatedSse({
    url: 'https://runtime.example/events',
    token: 'signed-access-token',
    fetchImpl,
    onEvent: (event) => events.push(event),
  });
  await stream.done;

  assert.deepEqual(requests, [{
    url: 'https://runtime.example/events',
    authorization: 'Bearer signed-access-token',
  }]);
  assert.deepEqual(events, [{ type: 'THOUGHT', data: { step: 'plan' } }]);
});

test('authenticated SSE resumes from the last applied sequence', async () => {
  const requests = [];
  const events = [];
  const encoder = new TextEncoder();
  const fetchImpl = async (url, init) => {
    requests.push({ url, lastEventId: init.headers['Last-Event-ID'] });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('id: 8\ndata: {"eventId":"evt_8","sequence":8,"type":"PLAN_REVISED","payload":{}}\n\n'));
        controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const stream = openAuthenticatedSse({
    url: 'https://runtime.example/events',
    token: 'signed-access-token',
    afterSequence: 7,
    fetchImpl,
    onEvent: (event) => events.push(event),
  });
  await stream.done;

  assert.deepEqual(requests, [{ url: 'https://runtime.example/events', lastEventId: '7' }]);
  assert.equal(events[0].sequence, 8);
  assert.equal(events[0].lastEventId, '8');
});

test('SSE cursor advances monotonically across duplicates and old events', () => {
  assert.equal(advanceSseCursor(7, { sequence: 8 }), 8);
  assert.equal(advanceSseCursor(8, { sequence: 8 }), 8);
  assert.equal(advanceSseCursor(8, { lastEventId: '4' }), 8);
  assert.equal(advanceSseCursor(8, { type: 'REPLAY_COMPLETE' }), 8);
});

test('SSE cursor storage is session-scoped and never moves backward', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readStoredSseCursor(storage, 'sess_a'), 0);
  assert.equal(writeStoredSseCursor(storage, 'sess_a', 9), 9);
  assert.equal(writeStoredSseCursor(storage, 'sess_a', 4), 9);
  assert.equal(readStoredSseCursor(storage, 'sess_a'), 9);
  assert.equal(readStoredSseCursor(storage, 'sess_b'), 0);
});

test('SSE waits for asynchronous authentication recovery before closing', async () => {
  const order = [];
  const stream = openAuthenticatedSse({
    url: '/events',
    token: 'expired-token',
    fetchImpl: async () => new Response('', { status: 401 }),
    onError: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('recovered');
    },
    onClose: () => order.push('closed'),
  });
  await stream.done;
  assert.deepEqual(order, ['recovered', 'closed']);
});
