import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectPendingAdvisorResponses,
  formatAdvisorResponse,
} from './advisorThreads.js';

test('captures every pending advisor and ignores unrelated projections', () => {
  const pending = new Map([
    ['a', { threadId: 'group:1', requestId: 'req:1' }],
    ['b', { threadId: 'group:1', requestId: 'req:1' }],
  ]);
  const seen = new Set();
  const responses = collectPendingAdvisorResponses({
    agents: {
      a: { id: 'a', finding: { findingId: 'fa', claim: '甲答复' } },
      b: { id: 'b', finding: { findingId: 'fb', claim: '乙答复' } },
      c: { id: 'c', finding: { findingId: 'fc', claim: '无关旧答复' } },
    },
    pending,
    seen,
  });
  assert.deepEqual(responses.map((item) => item.agent.id).sort(), ['a', 'b']);
  assert.equal(seen.size, 2);
  assert.equal(pending.size, 0);
});

test('same text can be captured again for a new user request', () => {
  const agent = { id: 'a', finding: { claim: '同一结论' } };
  const seen = new Set();
  const first = collectPendingAdvisorResponses({ agents: { a: agent }, pending: new Map([['a', { threadId: 'g', requestId: 'r1' }]]), seen });
  const second = collectPendingAdvisorResponses({ agents: { a: agent }, pending: new Map([['a', { threadId: 'g', requestId: 'r2' }]]), seen });
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0].id, second[0].id);
});

test('raw agent template is rendered as readable prose', () => {
  const text = formatAdvisorResponse('【主张】建议先试行。【依据】成本可控。【假设】预算稳定。【反转条件】成本翻倍。【置信度】85%');
  assert.match(text, /建议先试行/);
  assert.match(text, /我这样判断/);
  assert.doesNotMatch(text, /【主张】|【依据】/);
});
