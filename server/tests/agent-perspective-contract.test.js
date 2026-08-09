import test from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_POOL } from '../src/data/agentPool.js';
import { buildSelectionDimensions, uniqueValidAgentIds } from '../src/services/agentEngine.js';
import { perspectiveForAgent } from '../src/services/reactLoop.js';

const ALLOWED_PERSPECTIVES = new Set([
  'financial', 'career', 'risk', 'emotional', 'reflection', 'macro',
  'action', 'communication', 'legal', 'health', 'education', 'technical',
]);

test('every built-in agent declares a canonical perspective', () => {
  assert.equal(AGENT_POOL.length, 12);
  for (const agent of AGENT_POOL) {
    assert.ok(agent.perspective, `${agent.id} is missing perspective`);
    assert.ok(
      ALLOWED_PERSPECTIVES.has(agent.perspective),
      `${agent.id} has unsupported perspective: ${agent.perspective}`,
    );
  }
});

test('perspectiveForAgent preserves canonical values and maps legacy stance labels', () => {
  assert.equal(perspectiveForAgent({ perspective: 'technical' }), 'technical');
  assert.equal(perspectiveForAgent({ stance: '风险视角' }), 'risk');
  assert.equal(perspectiveForAgent({ stance: '财务分析' }), 'financial');
  assert.equal(perspectiveForAgent({}), 'reflection');
});

test('LLM agent selection is deduplicated before it reaches the UI', () => {
  assert.deepEqual(
    uniqueValidAgentIds(['jingyuan', 'fengyan', 'jingyuan', 'missing'], ['jingyuan', 'fengyan']),
    ['jingyuan', 'fengyan'],
  );
});

test('one orchestration result carries both advisor selection and decision dimensions', () => {
  const dimensions = buildSelectionDimensions({
    selectedAgentIds: ['qiangu', 'fengyan'],
    selectedAgents: [
      { id: 'qiangu', name: '钱谷', stance: '财务视角', perspective: 'financial' },
      { id: 'fengyan', name: '风眼', stance: '风险视角', perspective: 'risk' },
    ],
    modelDimensions: [
      { name: '共同预算边界', perspective: 'financial', agentIds: ['qiangu'], toolNeeds: ['web_search'] },
      { name: '最坏情况与退路', perspective: 'risk', agentIds: ['fengyan'], toolNeeds: [] },
    ],
  });

  assert.deepEqual(dimensions.map((dimension) => dimension.name), ['共同预算边界', '最坏情况与退路']);
  assert.deepEqual(dimensions[0].agents, ['qiangu']);
  assert.deepEqual(dimensions[0].toolNeeds, ['web_search']);
});
