import test from 'node:test';
import assert from 'node:assert/strict';

import BaseAgent from '../src/agents/BaseAgent.js';
import eventBus from '../src/services/eventBus.js';
import * as deliberationEngine from '../src/services/deliberationEngine.js';
import * as memoryService from '../src/services/memoryService.js';

const PLAN = {
  lensId: 24,
  lensName: '复',
  sourceDigest: 'a'.repeat(64),
  invariants: {
    evidenceLocked: true,
    riskLocked: true,
    approvalLocked: true,
    userDecisionLocked: true,
  },
  reviewTasks: [
    { id: 'lens-task-risk', kind: 'failure-mode', question: '最坏情况是什么？', targetPerspective: 'risk', causedBy: ['lens:24', 'conflict:risk'] },
    { id: 'lens-task-money', kind: 'assumption', question: '成本假设如何反转？', targetPerspective: 'financial', causedBy: ['lens:24', 'gap:cost'] },
    { id: 'lens-task-exit', kind: 'exit-condition', question: '何时应退出？', targetPerspective: 'action', causedBy: ['lens:24', 'finding:trial'] },
    { id: 'lens-task-overflow', kind: 'assumption', question: '不得执行第四项', targetPerspective: 'legal', causedBy: ['lens:24', 'gap:legal'] },
  ],
};

function createSession(id) {
  return {
    id,
    user_id: 'usr_lens_test',
    question: '是否在本月更换供应商？',
    round: 2,
    findings: [{ id: 'existing', content: '原发现', evidenceStatus: 'accepted', evidenceId: 'ev_1' }],
    riskAssessment: { level: 'R3' },
    approvalRequirements: { required: true },
    dynamicChoices: [{ id: 'hold', label: '暂缓' }],
  };
}

test('Lens executor routes at most three tasks through real BaseAgent/AgentRunner and appends linked unverified findings', async () => {
  const service = await import('../src/services/cognitivePerturbationService.js');
  assert.equal(typeof service.executeLensReviewTasks, 'function');

  const session = createSession('sess_lens_success');
  const immutable = structuredClone({
    findings: session.findings,
    riskAssessment: session.riskAssessment,
    approvalRequirements: session.approvalRequirements,
    dynamicChoices: session.dynamicChoices,
  });
  const started = [];
  const unsubscribe = eventBus.on('AGENT_STARTED', (event) => started.push(event));
  try {
    const result = await service.executeLensReviewTasks({
      session,
      plan: structuredClone(PLAN),
      actionId: 'execute-action-1',
    }, {
      callLLMFn: async (messages, options) => {
        assert.equal(options.temperature, 0);
        const taskInput = JSON.parse(messages[1].content);
        return JSON.stringify({
          outcome: taskInput.kind === 'exit-condition' ? 'exit-condition-added' : 'claim-challenged',
          summary: taskInput.kind === 'exit-condition' ? '增加待核验退出条件。' : '该说法仍缺少反例检验。',
        });
      },
    });

    assert.deepEqual(started.map((event) => event.actorId), ['fengyan', 'qiangu', 'zhenxing']);
    assert.equal(result.assignments.every((assignment) => assignment.agent instanceof BaseAgent), true);
    assert.deepEqual(result.assignments.map((assignment) => assignment.actionId), [
      'execute-action-1:lens:lens-task-risk',
      'execute-action-1:lens:lens-task-money',
      'execute-action-1:lens:lens-task-exit',
    ]);
    assert.equal(result.findings.length, immutable.findings.length + 3);
    assert.equal(new Set(result.findings.map((finding) => finding.id)).size, result.findings.length);
    for (const finding of result.findings.slice(-3)) {
      assert.equal(finding.lensId, 24);
      assert.match(finding.lensTaskId, /^lens-task-/);
      assert.equal(finding.evidenceStatus, 'unknown');
      assert.equal(Object.hasOwn(finding, 'evidenceId'), false);
      assert.equal(Object.hasOwn(finding, 'evidence'), false);
    }
    assert.equal(result.impacts.length, 3);
    assert.deepEqual(result.impacts.map((impact) => impact.findingIds.length), [1, 1, 1]);
    assert.equal(result.impacts.some((impact) => impact.outcome === 'evidence-added'), false);
    assert.deepEqual(session.findings, immutable.findings);
    assert.deepEqual(session.riskAssessment, immutable.riskAssessment);
    assert.deepEqual(session.approvalRequirements, immutable.approvalRequirements);
    assert.deepEqual(session.dynamicChoices, immutable.dynamicChoices);
  } finally {
    unsubscribe();
  }
});

test('failed or unavailable Lens model leaves tasks pending and rerun is idempotent', async () => {
  const { executeLensReviewTasks } = await import('../src/services/cognitivePerturbationService.js');
  const session = createSession('sess_lens_failure');
  const failed = await executeLensReviewTasks({
    session,
    plan: structuredClone(PLAN),
    actionId: 'execute-action-failure',
  }, { callLLMFn: async () => null });

  assert.deepEqual(failed.findings, session.findings);
  assert.deepEqual(failed.impacts, []);
  assert.deepEqual(failed.plan.reviewTasks.slice(0, 3).map((task) => task.status), ['pending', 'pending', 'pending']);

  const successful = await executeLensReviewTasks({
    session,
    plan: structuredClone(PLAN),
    actionId: 'execute-action-stable',
  }, { callLLMFn: async () => JSON.stringify({ outcome: 'claim-challenged', summary: '需要核验。' }) });
  const replay = await executeLensReviewTasks({
    session: { ...session, findings: successful.findings, lensImpacts: successful.impacts },
    plan: successful.plan,
    actionId: 'execute-action-stable',
  }, { callLLMFn: async () => { throw new Error('idempotent replay must not call model'); } });

  assert.deepEqual(replay.findings, successful.findings);
  assert.deepEqual(replay.impacts, successful.impacts);
  assert.deepEqual(replay.plan, successful.plan);
});

test('free-form prose and malformed Lens results remain pending', async () => {
  const { executeLensReviewTasks } = await import('../src/services/cognitivePerturbationService.js');
  const runAgentFn = async (agent, context) => ({ ok: true, output: await agent._execute(context) });
  const invalidOutputs = [
    '这段普通文字不能自动成为主张挑战。',
    JSON.stringify({ outcome: 'claim-challenged' }),
    JSON.stringify({ outcome: 'approved', summary: '越权结论。' }),
    JSON.stringify({ outcome: 'claim-challenged', summary: '核验。', prompt: 'hidden' }),
    JSON.stringify({ outcome: 'no-change', summary: '抱歉，我无法完成本次审查。' }),
    JSON.stringify({ outcome: 'no-change', summary: 42 }),
  ];

  for (const output of invalidOutputs) {
    const session = createSession(`sess_lens_invalid_${invalidOutputs.indexOf(output)}`);
    const result = await executeLensReviewTasks({
      session,
      plan: { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])] },
      actionId: 'execute-invalid',
    }, { callLLMFn: async () => output, runAgentFn });

    assert.deepEqual(result.findings, session.findings);
    assert.deepEqual(result.impacts, []);
    assert.equal(result.plan.reviewTasks[0].status, 'pending');
  }
});

test('controlled no-change completes with an execution record and no fabricated finding', async () => {
  const { executeLensReviewTasks } = await import('../src/services/cognitivePerturbationService.js');
  const session = createSession('sess_lens_no_change');
  const result = await executeLensReviewTasks({
    session,
    plan: { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])] },
    actionId: 'execute-no-change',
  }, {
    callLLMFn: async () => JSON.stringify({
      outcome: 'no-change',
      summary: '已完成审查，现有材料未产生可证明变化。',
    }),
    runAgentFn: async (agent, context) => ({ ok: true, output: await agent._execute(context) }),
  });

  assert.deepEqual(result.findings, session.findings);
  assert.equal(result.plan.reviewTasks[0].status, 'completed');
  assert.deepEqual(result.impacts, [{
    taskId: 'lens-task-risk',
    lensId: 24,
    outcome: 'no-change',
    findingIds: [],
    summary: '已完成审查，现有材料未产生可证明变化。',
    executionId: result.impacts[0].executionId,
    agentId: 'fengyan',
  }]);
  assert.match(result.impacts[0].executionId, /^lens-execution-[a-f0-9]{20}$/);
});

test('engine emits Lens selection and creation before execution, then only truthful completion events', async () => {
  assert.equal(typeof deliberationEngine.runLensReviewLifecycle, 'function');
  const session = createSession('sess_lens_order');
  const result = {
    session,
    cognitivePlan: { ...structuredClone(PLAN), reviewTasks: structuredClone(PLAN.reviewTasks.slice(0, 2)) },
    lensImpacts: [],
  };
  const emitted = [];
  let eventCountAtExecution = 0;
  const next = await deliberationEngine.runLensReviewLifecycle(result, {
    sessionId: session.id,
    actionId: 'execute-order',
  }, {
    claimFn: async (_sessionId, claim) => ({ claimed: true, session: { ...session, cognitive_plan: claim.cognitivePlan, lens_review: claim.lensReview } }),
    emitFn: async (_sessionId, event) => emitted.push(event.type),
    persistFn: async () => emitted.push('LENS_STATE_PERSISTED'),
    executeFn: async ({ plan }) => {
      eventCountAtExecution = emitted.length;
      const findings = plan.reviewTasks.map((task, index) => ({
        id: `lens-finding-${index + 1}`,
        lensTaskId: task.id,
        lensId: plan.lensId,
        evidenceStatus: 'unknown',
      }));
      return {
        plan: { ...plan, reviewTasks: plan.reviewTasks.map((task) => ({ ...task, status: 'completed' })) },
        findings: [...session.findings, ...findings],
        impacts: findings.map((finding) => ({
          taskId: finding.lensTaskId,
          lensId: plan.lensId,
          outcome: 'claim-challenged',
          findingIds: [finding.id],
          summary: '已挑战。',
        })),
      };
    },
  });

  assert.equal(eventCountAtExecution, 3);
  assert.deepEqual(emitted, [
    'LENS_SELECTED',
    'LENS_TASK_CREATED',
    'LENS_TASK_CREATED',
    'LENS_STATE_PERSISTED',
    'LENS_TASK_COMPLETED',
    'LENS_TASK_COMPLETED',
    'LENS_REVIEW_COMPLETED',
  ]);
  assert.equal(next.session.findings.length, 3);
  assert.equal(next.lensImpacts.length, 2);
});

test('persistence failure rejects the lifecycle and emits no completion events', async () => {
  const session = createSession('sess_lens_persist_failure');
  const result = {
    session,
    cognitivePlan: { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])] },
    lensImpacts: [],
  };
  const emitted = [];

  await assert.rejects(
    deliberationEngine.runLensReviewLifecycle(result, { sessionId: session.id, actionId: 'persist-failure' }, {
      claimFn: async (_sessionId, claim) => ({ claimed: true, session: { ...session, cognitive_plan: claim.cognitivePlan, lens_review: claim.lensReview } }),
      emitFn: async (_sessionId, event) => emitted.push(event.type),
      executeFn: async ({ plan }) => {
        const finding = { id: 'lens-finding-persist', lensTaskId: plan.reviewTasks[0].id, lensId: plan.lensId };
        return {
          plan,
          findings: [...session.findings, finding],
          impacts: [{ taskId: finding.lensTaskId, lensId: plan.lensId, outcome: 'claim-challenged', findingIds: [finding.id], summary: '已挑战。', executionId: 'lens-execution-persist', agentId: 'fengyan' }],
        };
      },
      persistFn: async () => { throw new Error('session write failed'); },
    }),
    /session write failed/,
  );

  assert.deepEqual(emitted, ['LENS_SELECTED', 'LENS_TASK_CREATED']);
});

test('a persisted Lens review is one-shot across distinct execute actions', async () => {
  const session = createSession('sess_lens_one_shot');
  const persistedPlan = {
    ...structuredClone(PLAN),
    review: { started: true, status: 'pending', actionId: 'first-action', completedTaskCount: 0, totalTaskCount: 3 },
  };
  const original = { session, cognitivePlan: persistedPlan, lensImpacts: [] };
  let executeCount = 0;
  const replay = await deliberationEngine.runLensReviewLifecycle(original, {
    sessionId: session.id,
    actionId: 'second-distinct-action',
  }, {
    emitFn: async () => { throw new Error('one-shot must not emit again'); },
    executeFn: async () => { executeCount += 1; },
  });

  assert.equal(executeCount, 0);
  assert.equal(replay, original);
});

test('durable Lens claim allows exactly one winner and stores the winning action', async () => {
  const sessionId = `sess_lens_durable_claim_${Date.now()}`;
  const plan = { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])] };
  await memoryService.saveSession({
    ...createSession(sessionId),
    state: 'REFLECT',
    cognitivePlan: plan,
    lensReview: null,
    lensImpacts: [],
  });

  const [first, second] = await Promise.all([
    memoryService.claimLensReview(sessionId, { cognitivePlan: plan, actionId: 'claim-a' }),
    memoryService.claimLensReview(sessionId, { cognitivePlan: plan, actionId: 'claim-b' }),
  ]);
  const winners = [first, second].filter((claim) => claim.claimed);
  const persisted = await memoryService.getSession(sessionId);

  assert.equal(winners.length, 1);
  assert.equal(persisted.lens_review.started, true);
  assert.equal(persisted.lens_review.status, 'running');
  assert.equal(persisted.lens_review.actionId, winners[0].session.lens_review.actionId);
  assert.deepEqual(persisted.cognitive_plan.review, persisted.lens_review);
});

test('a lost durable claim restores persisted Lens state without Agent or events', async () => {
  const session = createSession('sess_lens_claim_lost');
  const persistedReview = { started: true, status: 'running', actionId: 'winner', totalTaskCount: 1, completedTaskCount: 0, pendingTaskIds: ['lens-task-risk'] };
  const persistedPlan = { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])], review: persistedReview };
  const persistedSession = {
    ...session,
    state: 'REFLECT',
    cognitive_plan: persistedPlan,
    lens_impacts: [],
    lens_review: persistedReview,
  };
  let executeCount = 0;

  const restored = await deliberationEngine.runLensReviewLifecycle({
    session,
    cognitivePlan: { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])] },
    lensImpacts: [],
  }, { sessionId: session.id, actionId: 'loser' }, {
    claimFn: async () => ({ claimed: false, session: persistedSession }),
    emitFn: async () => { throw new Error('lost claim must not emit'); },
    executeFn: async () => { executeCount += 1; },
    persistFn: async () => { throw new Error('lost claim must not persist'); },
  });

  assert.equal(executeCount, 0);
  assert.equal(restored.lensReviewRecovered, true);
  assert.deepEqual(restored.cognitivePlan, persistedPlan);
  assert.deepEqual(restored.lensReview, persistedReview);
  assert.equal(restored.session.state, 'REFLECT');
});

test('concurrent distinct execute actions share one in-flight Lens lifecycle per session', async () => {
  const session = createSession('sess_lens_concurrent');
  const result = {
    session,
    cognitivePlan: { ...structuredClone(PLAN), reviewTasks: structuredClone(PLAN.reviewTasks.slice(0, 1)) },
    lensImpacts: [],
  };
  let executeCount = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const dependencies = {
    claimFn: async (_sessionId, claim) => ({ claimed: true, session: { ...session, cognitive_plan: claim.cognitivePlan, lens_review: claim.lensReview } }),
    emitFn: async () => {},
    persistFn: async () => {},
    executeFn: async ({ plan }) => {
      executeCount += 1;
      await gate;
      const finding = { id: 'lens-finding-concurrent', lensTaskId: plan.reviewTasks[0].id, lensId: plan.lensId };
      return {
        plan: { ...plan, reviewTasks: [{ ...plan.reviewTasks[0], status: 'completed' }] },
        findings: [...session.findings, finding],
        impacts: [{ taskId: finding.lensTaskId, lensId: plan.lensId, outcome: 'claim-challenged', findingIds: [finding.id], summary: '已挑战。' }],
      };
    },
  };

  const first = deliberationEngine.runLensReviewLifecycle(result, { sessionId: session.id, actionId: 'action-a' }, dependencies);
  const second = deliberationEngine.runLensReviewLifecycle(result, { sessionId: session.id, actionId: 'action-b' }, dependencies);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executeCount, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(secondResult.cognitivePlan, firstResult.cognitivePlan);
  assert.deepEqual(secondResult.lensImpacts, firstResult.lensImpacts);
});

test('distinct execute actions short-circuit before ReAct after a persisted Lens review starts', async () => {
  const sessionId = `sess_lens_execute_guard_${Date.now()}`;
  const lensReview = {
    started: true,
    status: 'pending',
    actionId: 'action-first',
    totalTaskCount: 1,
    completedTaskCount: 0,
    pendingTaskIds: ['lens-task-risk'],
  };
  await memoryService.saveSession({
    ...createSession(sessionId),
    state: 'ORACLE',
    plan: { agents: [], askUser: [] },
    cognitivePlan: { ...structuredClone(PLAN), reviewTasks: [structuredClone(PLAN.reviewTasks[0])], review: lensReview },
    lensReview,
    lensImpacts: [],
  });

  const sideEffects = [];
  const unsubscribeState = eventBus.on('STATE_CHANGE', (event) => {
    if (event.sessionId === sessionId) sideEffects.push(event.type);
  });
  const unsubscribeAgent = eventBus.on('AGENT_STARTED', (event) => {
    if (event.sessionId === sessionId) sideEffects.push(event.type);
  });
  try {
    const firstReplay = await deliberationEngine.execute(sessionId, [], {
      userId: 'usr_lens_test',
      actionId: 'action-second',
    });
    const secondReplay = await deliberationEngine.execute(sessionId, [], {
      userId: 'usr_lens_test',
      actionId: 'action-third',
    });

    assert.deepEqual(sideEffects, []);
    assert.deepEqual(firstReplay.lensReview, lensReview);
    assert.deepEqual(secondReplay.lensReview, lensReview);
    assert.equal(firstReplay.state, 'ORACLE');
  } finally {
    unsubscribeState();
    unsubscribeAgent();
  }
});

test('persistExecuteResult propagates write failure instead of returning success', async () => {
  await assert.rejects(
    deliberationEngine.persistExecuteResult('sess_lens_write_failure', {
      session: { state: 'ORACLE', findings: [], dynamicChoices: [] },
      conflicts: [],
      gaps: [],
      cognitivePlan: null,
      lensImpacts: [],
      lensReview: null,
    }, {
      updateSessionStateFn: async () => { throw new Error('durable write unavailable'); },
    }),
    /durable write unavailable/,
  );
});
