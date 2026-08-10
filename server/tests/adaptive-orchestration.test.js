import test from 'node:test';
import assert from 'node:assert/strict';

import OrchestratorAgent from '../src/agents/system/OrchestratorAgent.js';
import { run as runAgent } from '../src/agents/AgentRunner.js';

test('quick planning runs through OrchestratorAgent and assigns complementary advisors', async () => {
  const result = await runAgent(new OrchestratorAgent(), {
    sessionId: `sess_quick_orchestrator_${Date.now()}`,
    userId: 'adaptive_orchestration_user',
    round: 1,
    actionId: 'plan-round-1',
    blackboard: {
      mode: 'quick',
      question: '要不要吃饭',
      answers: [],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.output.planSource, 'quick-structured');
  assert.deepEqual(result.output.orchestration.informationFields.map((field) => field.id), [
    'body_signal', 'meal_context', 'current_goal',
  ]);
  assert.deepEqual(result.output.orchestration.advisors.map((agent) => agent.id), ['jiankang', 'xinhe']);
  assert.equal(new Set(result.output.orchestration.advisors.map((agent) => agent.perspective)).size, 2);
  assert.equal(result.output.autonomy, 'ASK');
});

test('OrchestratorAgent upgrades a quick session when answers reveal a behavior-change goal', async () => {
  const result = await runAgent(new OrchestratorAgent(), {
    sessionId: `sess_quick_upgrade_${Date.now()}`,
    userId: 'adaptive_orchestration_user',
    round: 2,
    actionId: 'plan-round-2',
    blackboard: {
      mode: 'quick',
      question: '要不要吃饭',
      answers: [
        { fieldId: 'body_signal', answer: '不饿，只是嘴馋' },
        { fieldId: 'meal_context', answer: '一小时前吃得很多' },
        { fieldId: 'current_goal', answer: '正在减脂控制体重' },
      ],
    },
  });

  assert.equal(result.output.autonomy, 'CONTINUE');
  assert.equal(result.output.orchestration.escalation.to, 'standard');
  assert.equal(result.output.orchestration.depth, 'standard');
});
