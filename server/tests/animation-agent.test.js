import test from 'node:test';
import assert from 'node:assert/strict';

import animationAgent from '../src/agents/system/AnimationAgent.js';

test('animation timeline injects valid advisor ids without mutating the phase definition', () => {
  const agents = [{ id: 'advisor_a' }, null, { id: 'advisor_b' }];

  const first = animationAgent.timelineFor('agent_debate', agents);
  const second = animationAgent.timelineFor('agent_debate', []);

  assert.deepEqual(first.steps[0].params.agentIds, ['advisor_a', 'advisor_b']);
  assert.deepEqual(second.steps[0].params.agentIds, []);
  assert.equal(first.totalMs, 3100);
});
