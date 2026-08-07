import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commitDomainEvents,
  evidenceDomainEvent,
  planDomainEvents,
  reflectionDomainEvents,
} from '../src/services/agentEventSemantics.js';

test('plan semantics expose tasks, assignments and unknowns without prompts', () => {
  const events = planDomainEvents({
    dimensions: [{ id: 'cost', name: '成本' }],
    agents: [{ id: 'risk', name: '风眼', perspective: '风险' }],
  }, [{ question: '预算上限是多少？', reason: '约束方案' }]);

  assert.deepEqual(events.map((event) => event.type), ['PLAN_CREATED', 'AGENT_ASSIGNED', 'UNKNOWN_IDENTIFIED']);
  assert.deepEqual(events[0].data.tasks, [{ id: 'cost', label: '成本', status: 'planned' }]);
  assert.equal(events[1].data.agentId, 'risk');
  assert.equal(events[2].data.question, '预算上限是多少？');
  assert.equal('prompt' in events[0].data, false);
});

test('tool result semantics distinguish accepted and rejected evidence', () => {
  const accepted = evidenceDomainEvent('web_search', {
    ok: true,
    evidence: { id: 'ev_1', summary: '公开报价', level: 'E2', sourceName: '官网', observedAt: '2026-08-07T08:00:00.000Z' },
  });
  const rejected = evidenceDomainEvent('web_search', {
    ok: false,
    error: { code: 'TOOL_RESULT_INVALID', message: '空结果' },
  });

  assert.equal(accepted.type, 'EVIDENCE_ACCEPTED');
  assert.equal(accepted.data.evidenceId, 'ev_1');
  assert.equal(rejected.type, 'EVIDENCE_REJECTED');
  assert.equal(rejected.data.reason, '空结果');
});

test('reflection and commit semantics cover conflict, replan, approval and crystallization', () => {
  const reflection = reflectionDomainEvents({
    conflicts: [{ claimId: 'claim_1', reason: '现金流假设冲突' }],
    replanned: true,
    reason: '需要压力测试',
    dynamicChoices: [{ id: 'trial', label: '先试两周' }],
  });
  const commit = commitDomainEvents({ choice: 'trial', summary: '形成可逆路径' });

  assert.deepEqual(reflection.map((event) => event.type), ['CLAIM_CHALLENGED', 'PLAN_REVISED', 'APPROVAL_REQUIRED']);
  assert.deepEqual(commit.map((event) => event.type), ['DECISION_COMMITTED', 'SESSION_COMPLETED']);
});
