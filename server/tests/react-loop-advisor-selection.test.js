import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdvisorAgents, runReActLoop } from '../src/services/reactLoop.js';

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

  const result = await runReActLoop('sess_review_confirmed', state, {
    callLLMFn: async () => JSON.stringify({ action: 'output', args: {}, reason: '贡献已齐' }),
    emitFn: async (_sessionId, event) => events.push(event),
    consumePendingCommandsFn: async () => [],
  });

  assert.equal(result.state, 'REFLECT');
  assert.equal(events.at(-1).type, 'CONCLUSION_READY');
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
