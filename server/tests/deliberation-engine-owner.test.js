import test from 'node:test';
import assert from 'node:assert/strict';

import * as engine from '../src/services/deliberationEngine.js';
import * as memoryService from '../src/services/memoryService.js';

async function ownedSession(overrides = {}) {
  return memoryService.saveSession({
    user_id: 'engine_owner_a',
    question: '是否换工作',
    state: 'WAIT',
    round: 1,
    plan: { askUser: [], clarifyQueue: [] },
    ...overrides,
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

test('commit reaches backend COMPLETE before the client can render final', async () => {
  const session = await ownedSession({
    state: 'ORACLE',
    dynamic_choices: [{ id: 'dyn_1', label: '先试行' }],
  });
  const owner = { userId: 'engine_owner_a' };

  const result = await engine.commit(session.id, 'dyn_1', '先试行两周', { ...owner, actionId: 'commit_action_1' });
  const replay = await engine.commit(session.id, 'dyn_1', '先试行两周', { ...owner, actionId: 'commit_action_1' });
  const restored = await engine.getState(session.id, owner);

  assert.equal(result.state, 'COMPLETE');
  assert.equal(result.fateTicket.choice, 'dyn_1');
  assert.equal(replay.fateTicket.ticketId, result.fateTicket.ticketId);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(restored.state, 'COMPLETE');
});

test('commit rejects a state leap and a choice outside server dynamic choices', async () => {
  const owner = { userId: 'engine_owner_a' };
  const waiting = await ownedSession();
  await assert.rejects(
    engine.commit(waiting.id, 'dyn_1', '', { ...owner, actionId: 'commit_waiting' }),
    (error) => error?.code === 'INVALID_SESSION_STATE',
  );

  const oracle = await ownedSession({
    state: 'ORACLE',
    dynamic_choices: [{ id: 'dyn_allowed', label: '允许的路径' }],
  });
  await assert.rejects(
    engine.commit(oracle.id, 'dyn_forged', '', { ...owner, actionId: 'commit_forged' }),
    (error) => error?.code === 'INVALID_COMMIT_CHOICE',
  );
});

test('concurrent commits with the same actionId share one authoritative result', async () => {
  const session = await ownedSession({
    state: 'ORACLE',
    dynamic_choices: [{ id: 'dyn_concurrent', label: '并发路径' }],
  });
  const command = { userId: 'engine_owner_a', actionId: 'commit_concurrent' };

  const [first, second] = await Promise.all([
    engine.commit(session.id, 'dyn_concurrent', '保持一致', command),
    engine.commit(session.id, 'dyn_concurrent', '保持一致', command),
  ]);

  assert.equal(second.fateTicket.ticketId, first.fateTicket.ticketId);
  assert.equal(second.idempotentReplay, true);
});

test('a failed planner attempt becomes one persisted fallback instead of overlapping retries', async () => {
  const session = await ownedSession({
    state: 'WAIT',
    round: 2,
    questionContext: '是否换工作 补充：我只能承受六个月空窗',
    answers: [{ answer: '我只能承受六个月空窗' }],
  });
  let attempts = 0;

  const result = await engine.planSessionWithFallback(session, async () => {
    attempts += 1;
    throw new Error('planner budget exhausted');
  });
  const restored = await memoryService.getSession(session.id);

  assert.equal(attempts, 1);
  assert.equal(result.fallback, true);
  assert.equal(result.session.state, 'EXECUTE');
  assert.equal(result.askUser.length, 0);
  assert.equal(restored.state, 'EXECUTE');
  assert.equal(restored.plan.round, 2);
  assert.equal(restored.question_context, session.questionContext);
  assert.deepEqual(restored.answers, session.answers);
});
