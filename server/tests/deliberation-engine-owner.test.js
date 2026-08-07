import test from 'node:test';
import assert from 'node:assert/strict';

import * as engine from '../src/services/deliberationEngine.js';
import * as memoryService from '../src/services/memoryService.js';

async function ownedSession() {
  return memoryService.saveSession({
    user_id: 'engine_owner_a',
    question: '是否换工作',
    state: 'WAIT',
    round: 1,
    plan: { askUser: [], clarifyQueue: [] },
  });
}

test('engine rejects a non-owner before every session read or mutation', async () => {
  const session = await ownedSession();
  const intruder = { userId: 'engine_owner_b' };
  const attempts = [
    () => engine.getState(session.id, intruder),
    () => engine.answer(session.id, [], intruder),
    () => engine.execute(session.id, [], { ...intruder, actionId: 'engine_owner_action_001' }),
    () => engine.commit(session.id, { id: 'a', label: 'A' }, '', intruder),
    () => engine.pause(session.id, 'test', intruder),
    () => engine.resume(session.id, intruder),
  ];

  for (const attempt of attempts) {
    await assert.rejects(attempt, (error) => error?.code === 'SESSION_NOT_FOUND');
  }
});

test('engine allows the verified owner to read the session', async () => {
  const session = await ownedSession();
  const restored = await engine.getState(session.id, { userId: 'engine_owner_a' });

  assert.equal(restored.sessionId, session.id);
  assert.equal(restored.state, 'WAIT');
});
