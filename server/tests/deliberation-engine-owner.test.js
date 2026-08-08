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
  const session = await ownedSession({
    tool_results: [{ ok: true, evidence: { id: 'ev_restore', summary: '可恢复证据', accepted: true } }],
    findings: [{ agentId: 'risk', content: '风险可控' }],
    conflicts: [{ reason: '成本假设冲突' }],
    dynamic_choices: [{ id: 'trial', label: '先试行' }],
    master_summary: '形成可逆路径',
    replan_count: 2,
  });
  const restored = await engine.getState(session.id, { userId: 'engine_owner_a' });

  assert.equal(restored.sessionId, session.id);
  assert.equal(restored.state, 'WAIT');
  assert.equal(restored.question, '是否换工作');
  assert.equal(restored.toolResults[0].evidence.id, 'ev_restore');
  assert.equal(restored.findings[0].agentId, 'risk');
  assert.equal(restored.conflicts[0].reason, '成本假设冲突');
  assert.equal(restored.dynamicChoices[0].id, 'trial');
  assert.equal(restored.masterSummary, '形成可逆路径');
  assert.equal(restored.replanCount, 2);
});

test('READY session cannot execute until the owner confirms facts and selected memories', async () => {
  const session = await ownedSession({
    state: 'READY',
    plan: {
      askUser: [],
      caseFile: {
        objective: '是否换工作',
        facts: [{ id: 'f1', value: '只能承受三个月空窗', source: 'user', status: 'confirmed' }],
        unknowns: [],
        memoryCandidates: [
          { id: 'm1', content: '过去偏好可逆方案', type: 'preference', status: 'pending' },
          { id: 'm2', content: '旧城市信息', type: 'context', status: 'pending' },
        ],
        readiness: { status: 'review' },
        confirmedByUser: false,
      },
    },
  });

  const blocked = await engine.execute(session.id, [], {
    userId: 'engine_owner_a', actionId: 'before_case_confirmation',
  });
  assert.equal(blocked.state, 'READY');
  assert.equal(blocked.caseConfirmationRequired, true);

  await assert.rejects(
    engine.confirmCase(session.id, {}, { userId: 'engine_owner_b' }),
    (error) => error?.code === 'SESSION_NOT_FOUND',
  );

  const confirmed = await engine.confirmCase(session.id, {
    acceptedMemoryIds: ['m1'],
    additionalContext: '希望先试行两周',
  }, { userId: 'engine_owner_a' });
  const stored = await memoryService.getSession(session.id);

  assert.equal(confirmed.state, 'EXECUTE');
  assert.equal(confirmed.caseFile.confirmedByUser, true);
  assert.equal(stored.memory_used.length, 1);
  assert.match(stored.question_context, /只能承受三个月空窗/);
  assert.match(stored.question_context, /过去偏好可逆方案/);
  assert.doesNotMatch(stored.question_context, /旧城市信息/);
});

test('deferred start returns a persisted PLAN session before planner work begins', async () => {
  let plannerCalls = 0;
  const created = await engine.createSession('要不要吃饭', 'engine_deferred_owner', {
    planFn: async () => { plannerCalls += 1; },
  });
  const stored = await memoryService.getSession(created.sessionId);

  assert.equal(plannerCalls, 0);
  assert.equal(created.state, 'PLAN');
  assert.equal(created.question, '要不要吃饭');
  assert.equal(stored.user_id, 'engine_deferred_owner');
  assert.equal(stored.plan, undefined);
});

test('deferred planning verifies ownership and returns the authoritative planned session', async () => {
  const created = await engine.createSession('要不要吃饭', 'engine_plan_owner');
  const planSessionFn = async (session) => ({
    session: {
      ...session,
      state: 'EXECUTE',
      plan: {
        dimensions: [{ id: 'body_signal', name: '身体信号' }],
        agents: [{ id: 'health', name: '衡生', taskId: 'body_signal' }],
      },
    },
    plan: {
      dimensions: [{ id: 'body_signal', name: '身体信号' }],
      agents: [{ id: 'health', name: '衡生', taskId: 'body_signal' }],
    },
    askUser: [],
    openingLine: '先看身体信号。',
    round: 1,
    memory: [],
  });

  await assert.rejects(
    engine.plan(created.sessionId, { userId: 'engine_plan_intruder' }, { planSessionFn }),
    (error) => error?.code === 'SESSION_NOT_FOUND',
  );

  const result = await engine.plan(created.sessionId, { userId: 'engine_plan_owner' }, { planSessionFn });
  assert.equal(result.state, 'READY');
  assert.equal(result.plan.dimensions[0].name, '身体信号');
  assert.equal((await memoryService.getSession(created.sessionId)).state, 'READY');
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
  assert.equal(result.session.state, 'READY');
  assert.equal(result.askUser.length, 0);
  assert.equal(restored.state, 'READY');
  assert.equal(restored.plan.round, 2);
  assert.equal(restored.question_context, session.questionContext);
  assert.deepEqual(restored.answers, session.answers);
});

test('answer persistence failures bypass planner fallback', async () => {
  const session = await ownedSession({
    state: 'PLAN',
    plan: { askUser: [{ question: '请补充期限' }], round: 2 },
  });
  const persistError = Object.assign(new Error('answer save unavailable'), {
    code: 'ANSWER_PERSIST_FAILED',
  });

  await assert.rejects(
    engine.planSessionWithFallback(session, async () => { throw persistError; }),
    (error) => error === persistError,
  );

  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'PLAN');
  assert.deepEqual(persisted.plan.askUser, [{ question: '请补充期限' }]);
});

test('answer claim rejects a WAIT session while an execute lease is running', async () => {
  assert.equal(typeof memoryService.claimClarifyAnswer, 'function');
  const session = await ownedSession({
    plan: { askUser: [{ question: '还需要补充什么？' }], round: 1 },
  });
  const running = await memoryService.claimExecute(session.id, {
    actionId: 'answer-race-action',
    now: 70_000,
    leaseMs: 500,
  });

  await assert.rejects(
    memoryService.claimClarifyAnswer(session.id, session),
    /ANSWER_STATE_CONFLICT/,
  );
  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'WAIT');
  assert.equal(persisted.execute_status, 'running');
  assert.equal(persisted.execute_claim_token, running.claimToken);
});

test('answer and execute cannot race past a completed CLARIFY handoff', async () => {
  const session = await ownedSession({
    plan: { askUser: [{ question: '还需要补充什么？' }], round: 1 },
  });
  const executeClaim = await memoryService.claimExecute(session.id, {
    actionId: 'clarify-owner-action',
    now: 80_000,
    leaseMs: 5_000,
  });
  await engine.persistClarifyExecute(
    session.id,
    executeClaim.session,
    session.plan.askUser,
    { actionId: 'clarify-owner-action', claimToken: executeClaim.claimToken },
  );
  let answerClaimCount = 0;
  let executeCount = 0;
  const claimAnswerFn = async (id, snapshot) => {
    answerClaimCount += 1;
    const claimed = await memoryService.claimClarifyAnswer(id, snapshot);
    await new Promise((resolve) => setImmediate(resolve));
    return claimed;
  };
  const planSessionFn = async (claimedSession, { saveSessionFn }) => {
    const plan = { ...claimedSession.plan, askUser: [], round: 2 };
    const plannedSession = { ...claimedSession, state: 'EXECUTE', plan, round: 2 };
    await saveSessionFn(plannedSession);
    return {
      session: plannedSession,
      plan,
      askUser: [],
      openingLine: '',
      round: 2,
      memory: [],
    };
  };

  const [answerResult, executeResult] = await Promise.allSettled([
    engine.answer(
      session.id,
      [{ answer: '补充信息' }],
      { userId: session.user_id },
      { claimAnswerFn, planSessionFn },
    ),
    engine.execute(
      session.id,
      [],
      { userId: session.user_id, actionId: 'other-execute-action' },
      {
        flightRegistry: new Map(),
        executeFn: async () => {
          executeCount += 1;
          return { sessionId: session.id, state: 'ORACLE', findings: [] };
        },
      },
    ),
  ]);

  assert.equal(answerResult.status, 'fulfilled');
  assert.equal(executeResult.status, 'fulfilled');
  assert.equal(executeResult.value.state, 'CLARIFY');
  assert.equal(answerClaimCount, 1);
  assert.equal(executeCount, 0);
  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'READY');
  assert.equal(persisted.execute_status, null);
  assert.equal(persisted.execute_claim_token, null);
});

test('a crashed answer lease can be taken over after expiry', async () => {
  const session = await ownedSession({
    plan: { askUser: [{ question: '请补充边界' }], round: 1 },
  });
  const first = await memoryService.claimClarifyAnswer(session.id, session, {
    now: 100_000,
    leaseMs: 100,
  });
  assert.equal(first.session.state, 'PLAN');
  assert.equal(first.session.execute_status, 'answering');
  await assert.rejects(
    memoryService.claimClarifyAnswer(session.id, first.session, { now: 100_099, leaseMs: 100 }),
    /ANSWER_STATE_CONFLICT/,
  );

  const replacement = await memoryService.claimClarifyAnswer(session.id, first.session, {
    now: 100_101,
    leaseMs: 100,
  });
  assert.notEqual(replacement.claimToken, first.claimToken);
  assert.equal(replacement.session.execute_status, 'answering');
  assert.equal(replacement.session.execute_lease_expires_at, 100_201);

  const staleRelease = await memoryService.claimClarifyAnswer(session.id, session, {
    mode: 'release',
    claimToken: first.claimToken,
    patch: memoryService.toSessionPersistenceData(session),
  });
  assert.equal(staleRelease.released, false);
  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'PLAN');
  assert.equal(persisted.execute_claim_token, replacement.claimToken);
});

test('planner crash releases only the current answer lease back to WAIT', async () => {
  const session = await ownedSession({
    plan: { askUser: [{ question: '请补充预算' }], round: 1 },
  });

  await assert.rejects(
    engine.answer(
      session.id,
      [{ answer: '预算十万' }],
      { userId: session.user_id },
      { planSessionFn: async () => { throw new Error('planner crashed'); } },
    ),
    /planner crashed/,
  );

  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'WAIT');
  assert.deepEqual(persisted.plan.askUser, [{ question: '请补充预算' }]);
  assert.equal(persisted.execute_status, null);
  assert.equal(persisted.execute_claim_token, null);
});

test('planner output stays behind the answer lease until one atomic complete CAS', async () => {
  const session = await ownedSession({
    plan: { askUser: [{ question: '请补充期限' }], round: 1 },
  });
  let unblockPlanner;
  let markPlanned;
  const plannerBlocked = new Promise((resolve) => { unblockPlanner = resolve; });
  const planned = new Promise((resolve) => { markPlanned = resolve; });
  const answerPromise = engine.answer(
    session.id,
    [{ answer: '三个月' }],
    { userId: session.user_id },
    {
      planSessionFn: async (current, { saveSessionFn }) => {
        current.state = 'EXECUTE';
        current.plan = { ...current.plan, askUser: [], round: 2 };
        await saveSessionFn(current);
        markPlanned();
        await plannerBlocked;
        return {
          session: current,
          plan: current.plan,
          askUser: [],
          openingLine: '',
          round: 2,
          memory: [],
        };
      },
    },
  );

  await planned;
  const beforeComplete = await memoryService.getSession(session.id);
  assert.equal(beforeComplete.state, 'PLAN');
  assert.deepEqual(beforeComplete.plan.askUser, [{ question: '请补充期限' }]);
  assert.equal(beforeComplete.execute_status, 'answering');

  unblockPlanner();
  await answerPromise;
  const completed = await memoryService.getSession(session.id);
  assert.equal(completed.state, 'READY');
  assert.deepEqual(completed.plan.askUser, []);
  assert.equal(completed.execute_status, null);
  assert.equal(completed.execute_claim_token, null);
});

test('atomic answer completion failure rolls the lease back for retry', async () => {
  const session = await ownedSession({
    plan: { askUser: [{ question: '请补充期限' }], round: 1 },
  });
  const transitionModes = [];
  const answerTransitionFn = async (id, snapshot, options = {}) => {
    transitionModes.push(options.mode || 'claim');
    if (options.mode === 'complete') throw new Error('answer complete unavailable');
    return memoryService.claimClarifyAnswer(id, snapshot, options);
  };
  const planSessionFn = async (current, { saveSessionFn }) => {
    current.state = 'EXECUTE';
    current.plan = { ...current.plan, askUser: [], round: 2 };
    await saveSessionFn(current);
    return {
      session: current,
      plan: current.plan,
      askUser: [],
      openingLine: '',
      round: 2,
      memory: [],
    };
  };

  await assert.rejects(
    engine.answer(
      session.id,
      [{ answer: '三个月' }],
      { userId: session.user_id },
      { answerTransitionFn, planSessionFn },
    ),
    /answer complete unavailable/,
  );

  assert.deepEqual(transitionModes, ['claim', 'complete', 'release']);
  const persisted = await memoryService.getSession(session.id);
  assert.equal(persisted.state, 'WAIT');
  assert.deepEqual(persisted.plan.askUser, [{ question: '请补充期限' }]);
  assert.equal(persisted.execute_status, null);
  assert.equal(persisted.execute_claim_token, null);
});
