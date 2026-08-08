import test from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_POOL } from '../src/data/agentPool.js';
import { uniqueValidAgentIds } from '../src/services/agentEngine.js';
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
