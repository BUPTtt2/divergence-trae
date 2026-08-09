import test from 'node:test';
import assert from 'node:assert/strict';

import { reflect } from '../src/services/reflector.js';

test('partial perspective coverage is surfaced as unknown instead of rerunning every agent', async () => {
  const session = {
    id: 'sess_partial_coverage',
    question: '是否继续投入产品？',
    state: 'REFLECT',
    replan_count: 0,
    plan: {
      dimensions: [
        { name: '风险', perspective: 'risk' },
        { name: '成本', perspective: 'financial' },
      ],
    },
    findings: [
      {
        agentId: 'fengyan',
        agentName: '风眼',
        perspective: 'risk',
        content: '留存未验证是主要风险',
        stance: 'negative',
        evidenceStatus: 'accepted',
      },
    ],
    tool_results: [],
  };

  const result = await reflect(session, {
    callLLMFn: async () => null,
    generateMasterSummaryFn: async () => ({ summary: '', options: [] }),
  });

  assert.equal(result.replanned, false);
  assert.equal(result.session.state, 'ORACLE');
  assert.equal(result.session.replan_count, 0);
  assert.deepEqual(result.gaps.map((gap) => gap.perspective), ['financial']);
  assert.deepEqual(
    result.oracle.lineMeta.slice(0, 2).map((line) => line.knowledgeState),
    ['verified', 'unknown'],
  );
});

test('reflector fails closed when the confirmed council has not contributed', async () => {
  const session = {
    id: 'sess_missing_contributions',
    question: '要不要吃饭',
    state: 'REFLECT',
    plan: {
      depth: 'standard',
      selectedAgentIds: ['health', 'reflection'],
      dimensions: [],
    },
    findings: [],
    tool_results: [],
  };

  const result = await reflect(session, {
    callLLMFn: async () => null,
    generateMasterSummaryFn: async () => {
      throw new Error('insufficient findings must not reach summary generation');
    },
  });

  assert.equal(result.session.state, 'DELIBERATION_BLOCKED');
  assert.equal(result.oracle, null);
  assert.deepEqual(result.session.dynamicChoices, []);
  assert.equal(result.session.masterSummary, '');
  assert.equal(result.contributionGate.allowed, false);
});
