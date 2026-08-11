import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdvisorFinding, resolveAdvisorAgents, runReActLoop } from '../src/services/reactLoop.js';
import { normalizeCommandInput } from '../src/services/deliberationCommandService.js';

const pool = [
  { id: 'qiangu', name: '乾估' },
  { id: 'jiankang', name: '健康' },
  { id: 'jiaoyu', name: '教育' },
];

test('resolveAdvisorAgents accepts IDs and names from the current advisor pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['jiankang', '乾估'], pool).map((agent) => agent.id),
    ['jiankang', 'qiangu'],
  );
});

test('resolveAdvisorAgents replaces stale model choices with the current advisor pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['镜渊', '风眼'], pool).map((agent) => agent.id),
    ['qiangu', 'jiankang'],
  );
});

test('resolveAdvisorAgents removes duplicates without leaving the current pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['健康', 'jiankang', 'unknown'], pool).map((agent) => agent.id),
    ['jiankang'],
  );
});

test('advisor finding records tool results and a declared confidence', () => {
  const finding = createAdvisorFinding(
    { id: 'qiangu', name: '乾估', perspective: 'financial' },
    '【主张】先核对预算。\n【依据】现有租金证据不足。\n【假设】预算口径未变。\n【反转条件】预算翻倍。\n【置信度】65%',
    { plan: {}, toolResults: [{ tool: 'web_search', status: 'accepted', summary: '两条可核验租金来源', evidence: { id: 'ev_1' } }] },
    1,
    0,
  );

  assert.equal(finding.confidence, 0.65);
  assert.deepEqual(finding.toolResults, [{ tool: 'web_search', status: 'accepted', summary: '两条可核验租金来源' }]);
});

test('a user question must name exactly one target advisor', () => {
  assert.throws(() => normalizeCommandInput({ commandType: 'QUESTION', content: '怎么看？' }), /指定一位智囊/);
  assert.deepEqual(normalizeCommandInput({ commandType: 'QUESTION', content: '怎么看？', targetAgentId: 'baby' }), {
    commandType: 'QUESTION',
    content: '怎么看？',
    targetAgentId: 'baby',
  });
});

test('empty orchestrator output still runs every confirmed advisor before reflection', async () => {
  const events = [];
  const state = {
    question: '要不要吃饭',
    questionContext: '要不要吃饭',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang'] },
    advisorPool: pool.slice(0, 2),
    findings: [],
    toolResults: [],
    dialogue: [],
  };

  const result = await runReActLoop('sess_fallback_council', state, {
    callLLMFn: async () => '',
    generateAgentDialogueFn: async (agent) => `${agent.name}给出独立判断`,
    emitFn: async (_sessionId, event) => events.push(event),
    consumePendingCommandsFn: async () => [],
  });

  assert.equal(result.state, 'ROUND_REVIEW');
  assert.equal(state.findings.length, 2);
  assert.deepEqual(state.findings.map((finding) => finding.agentId), ['qiangu', 'jiankang']);
  assert.ok(state.findings.every((finding) => finding.findingId && finding.claim));
  assert.equal(events.filter((event) => event.type === 'ADVISOR_SPEAK').length, 2);
  assert.equal(events.at(-1).type, 'ROUND_AWAITING_USER');
});

test('confirmed round review is the only path from findings to reflection', async () => {
  const state = {
    question: '要不要吃饭',
    questionContext: '要不要吃饭',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang'] },
    advisorPool: pool.slice(0, 2),
    findings: [
      { agentId: 'qiangu', content: '判断一', claim: '判断一', findingId: 'finding_1' },
      { agentId: 'jiankang', content: '判断二', claim: '判断二', findingId: 'finding_2' },
    ],
    toolResults: [],
    dialogue: [],
    roundReviewConfirmed: true,
  };
  const events = [];
  let orchestratorCalls = 0;

  const result = await runReActLoop('sess_review_confirmed', state, {
    callLLMFn: async () => {
      orchestratorCalls += 1;
      throw new Error('确认本轮后不应重新运行编排模型');
    },
    emitFn: async (_sessionId, event) => events.push(event),
    consumePendingCommandsFn: async () => [],
  });

  assert.equal(result.state, 'REFLECT');
  assert.equal(orchestratorCalls, 0);
  assert.equal(events.at(-1).type, 'CONCLUSION_READY');
});

test('a completed confirmed council stops immediately without calling an advisor twice', async () => {
  const state = {
    question: '要不要北京租房',
    questionContext: '要不要北京租房',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang'] },
    advisorPool: pool.slice(0, 2),
    findings: [],
    toolResults: [],
    dialogue: [],
  };
  let orchestratorCalls = 0;
  const advisorCalls = [];

  const result = await runReActLoop('sess_single_contribution_per_advisor', state, {
    callLLMFn: async () => {
      orchestratorCalls += 1;
      return JSON.stringify({
        action: 'advisor_call',
        args: { agentIds: ['qiangu', 'jiankang'] },
        reason: '收集两位智囊的独立判断',
      });
    },
    generateAgentDialogueFn: async (agent) => {
      advisorCalls.push(agent.id);
      return `${agent.name}给出独立判断`;
    },
    emitFn: async () => {},
    consumePendingCommandsFn: async () => [],
  });

  assert.equal(result.state, 'ROUND_REVIEW');
  assert.equal(orchestratorCalls, 1);
  assert.deepEqual(advisorCalls, ['qiangu', 'jiankang']);
  assert.deepEqual(state.findings.map((finding) => finding.agentId), ['qiangu', 'jiankang']);
});

test('an orchestrated advisor batch runs serially to protect a single free provider', async () => {
  const state = {
    question: '要不要北京租房',
    questionContext: '要不要北京租房',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang', 'jiaoyu'] },
    advisorPool: pool,
    findings: [],
    toolResults: [],
    dialogue: [],
  };
  let active = 0;
  let maxActive = 0;

  const result = await runReActLoop('sess_serial_provider', state, {
    callLLMFn: async () => JSON.stringify({
      action: 'advisor_call',
      args: { agentIds: ['qiangu', 'jiankang', 'jiaoyu'] },
      reason: '收集三位智囊的独立判断',
    }),
    generateAgentDialogueFn: async (agent) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return `${agent.name}给出独立判断`;
    },
    emitFn: async () => {},
    consumePendingCommandsFn: async () => [],
  });

  assert.equal(result.state, 'ROUND_REVIEW');
  assert.equal(maxActive, 1);
  assert.deepEqual(state.findings.map((finding) => finding.agentId), ['qiangu', 'jiankang', 'jiaoyu']);
});

test('a user question opens a new advisor round instead of reflecting stale findings', async () => {
  const state = {
    question: '要不要吃饭',
    questionContext: '要不要吃饭',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang'], deliberationRound: 1 },
    advisorPool: pool.slice(0, 2),
    findings: [
      { agentId: 'qiangu', content: '旧判断一', claim: '旧判断一' },
      { agentId: 'jiankang', content: '旧判断二', claim: '旧判断二' },
    ],
    toolResults: [],
    dialogue: [],
    roundReviewConfirmed: true,
  };

  const result = await runReActLoop('sess_user_question', state, {
    callLLMFn: async () => '',
    generateAgentDialogueFn: async (agent, context) => `${agent.name}回应新问题：${context}`,
    emitFn: async () => {},
    consumePendingCommandsFn: async () => [{
      id: 'cmd_question',
      command_type: 'QUESTION',
      content: '如果晚上还要运动呢？',
      target_agent_id: null,
    }],
  });

  assert.equal(result.state, 'ROUND_REVIEW');
  assert.equal(state.plan.deliberationRound, 2);
  assert.equal(state.findings.length, 2);
  assert.ok(state.findings.every((finding) => finding.content.includes('如果晚上还要运动呢')));
  assert.ok(state.previousFindings.every((finding) => finding.content.startsWith('旧判断')));
});

test('a targeted user question calls only the named advisor and preserves the prior council record', async () => {
  const state = {
    question: '要不要北京租房',
    questionContext: '要不要北京租房',
    plan: { depth: 'standard', selectedAgentIds: ['qiangu', 'jiankang'], deliberationRound: 1 },
    advisorPool: pool.slice(0, 2),
    findings: [
      { agentId: 'qiangu', content: '旧判断一', claim: '旧判断一' },
      { agentId: 'jiankang', content: '旧判断二', claim: '旧判断二' },
    ],
    toolResults: [],
    dialogue: [],
    roundReviewConfirmed: true,
  };
  const called = [];

  const result = await runReActLoop('sess_targeted_question', state, {
    callLLMFn: async () => '',
    generateAgentDialogueFn: async (agent, context) => {
      called.push(agent.id);
      return `${agent.name}单独回应：${context}`;
    },
    emitFn: async () => {},
    consumePendingCommandsFn: async () => [{
      id: 'cmd_targeted',
      command_type: 'QUESTION',
      content: '你对通勤时间怎么看？',
      target_agent_id: 'jiankang',
    }],
  });

  assert.equal(result.state, 'ROUND_REVIEW');
  assert.deepEqual(called, ['jiankang']);
  assert.equal(state.findings.length, 1);
  assert.equal(state.findings[0].agentId, 'jiankang');
  assert.equal(state.previousFindings.length, 2);
});

test('supplement invalidates only findings that depend on the changed fact', async () => {
  const state = {
    question: '要不要北京租房',
    questionContext: '要不要北京租房',
    answers: [],
    plan: {
      depth: 'standard',
      selectedAgentIds: ['qiangu', 'xinhe'],
      informationFields: [{ id: 'budget', prompt: '预算是多少？', blocking: true }],
      caseAnalysis: { understanding: '预算尚未确认。' },
      caseFile: { facts: [], unknowns: [] },
    },
    advisorPool: [{ id: 'qiangu', name: '乾估' }, { id: 'xinhe', name: '心禾' }],
    findings: [
      { agentId: 'qiangu', claim: '预算风险较高', reasoning: '现有预算不够稳定' },
      { agentId: 'xinhe', claim: '需要共同沟通', reasoning: '关系目标尚未对齐' },
    ],
    toolResults: [], dialogue: [], roundReviewConfirmed: true,
  };

  const result = await runReActLoop('sess_incremental_fact', state, {
    consumePendingCommandsFn: async () => [{
      id: 'cmd_budget', command_type: 'SUPPLEMENT', content: '预算改为每人 2000 元', target_agent_id: null,
    }],
    reanalyzeCaseFn: async () => ({
      understanding: '两人各自可承担 2000 元。',
      informationFields: [{ id: 'budget', prompt: '预算是多少？', blocking: false }],
      inferences: [], unknownLabels: [], conflicts: [],
    }),
    emitFn: async () => {},
  });

  assert.equal(result.state, 'READY');
  assert.deepEqual(result.affectedAdvisorIds, ['qiangu']);
  assert.deepEqual(state.plan.pendingAdvisorIds, ['qiangu']);
  assert.equal(state.plan.caseFile.understanding, '两人各自可承担 2000 元。');
});

for (const commandType of ['SUPPLEMENT', 'CORRECTION']) {
  test(`${commandType} stops the council and sends the changed fact back to case analysis`, async () => {
    const state = {
      question: '要不要北京租房',
      questionContext: '要不要北京租房',
      plan: { depth: 'standard', selectedAgentIds: ['qiangu'] },
      advisorPool: pool.slice(0, 1),
      findings: [{ agentId: 'qiangu', content: '旧判断', claim: '旧判断' }],
      toolResults: [],
      dialogue: [],
      roundReviewConfirmed: true,
    };
    const called = [];

    const result = await runReActLoop(`sess_${commandType.toLowerCase()}`, state, {
      callLLMFn: async () => JSON.stringify({ action: 'output', args: {}, reason: '不应继续' }),
      generateAgentDialogueFn: async () => { called.push('advisor'); return '不应调用'; },
      emitFn: async () => {},
      consumePendingCommandsFn: async () => [{
        id: `cmd_${commandType.toLowerCase()}`,
        command_type: commandType,
        content: commandType === 'CORRECTION' ? '预算不是2000，是每人2000' : '女友工作地点尚未确定',
        target_agent_id: null,
      }],
    });

    assert.equal(result.state, 'READY');
    assert.deepEqual(called, []);
    assert.match(state.questionContext, commandType === 'CORRECTION' ? /预算不是2000/ : /工作地点尚未确定/);
  });
}
