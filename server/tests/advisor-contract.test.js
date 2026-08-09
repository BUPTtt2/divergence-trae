import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdvisor, formatAdvisorForAgentPool } from '../src/services/customAdvisorService.js';

test('a forged advisor becomes an executable contract instead of a persona-only prompt', async () => {
  const advisor = await createAdvisor(`contract_owner_${Date.now()}`, {
    name: '断舍',
    persona: '帮助用户识别继续投入的沉没成本。',
    perspective: '风险',
    objective: '找出继续投入的退出条件',
    methodology: ['区分沉没成本与未来成本', '提出一个可验证的止损点'],
    completionCriteria: ['给出至少一个反转条件'],
    safetyBoundaries: ['不替用户作最终决定'],
  });

  const executable = formatAdvisorForAgentPool(advisor);
  assert.equal(executable.objective, '找出继续投入的退出条件');
  assert.deepEqual(executable.methodology, ['区分沉没成本与未来成本', '提出一个可验证的止损点']);
  assert.match(executable.identity, /找出继续投入的退出条件/);
  assert.match(executable.deliverable, /反转条件/);
  assert.equal(executable.toolPolicy.allow.length, 0);
  assert.equal(executable.evidencePolicy.minimumLevel, 'E0');
  assert.equal(executable.budget.maxTurns, 2);
});
