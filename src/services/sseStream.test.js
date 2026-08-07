import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
