import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArenaViewModel, selectVisibleArenaNodes } from './arenaViewModel.js';

test('facts, unknowns, advisors, evidence and conflicts become traceable arena nodes', () => {
  const view = buildArenaViewModel({
    phase: 'agent_debate',
    caseFile: {
      facts: [{ id: 'budget', label: '预算', value: '2000 元', confidence: 1 }],
      unknowns: [{ id: 'commute', label: '通勤时间' }],
    },
    projection: {
      status: 'researching',
      agents: { fengyan: { id: 'fengyan', agentName: '风眼', status: 'running', perspective: '风险' } },
      evidence: { rent: { id: 'rent', summary: '附近租金约 1800 元', sourceName: '租房行情', accepted: true } },
      conflicts: [{ eventId: 'conflict-1', sourceAgentId: 'fengyan', targetAgentId: 'qiangu', reason: '现金流判断不同' }],
      activity: [{ id: 'activity-1', type: 'USER_INTERJECTED', title: '你补充了事实', detail: '实习是为了转正' }],
      motionCue: { id: 'event-1', kind: 'conflict' },
    },
  });

  assert.equal(view.mode, 'deliberating');
  assert.ok(view.nodes.some((node) => node.id === 'fact:budget' && node.kind === 'fact'));
  assert.ok(view.nodes.some((node) => node.id === 'unknown:commute' && node.kind === 'unknown'));
  assert.ok(view.nodes.some((node) => node.id === 'advisor:fengyan' && node.kind === 'advisor'));
  assert.ok(view.nodes.some((node) => node.id === 'evidence:rent' && node.kind === 'evidence'));
  assert.ok(view.nodes.some((node) => node.id === 'interjection:activity-1'));
  assert.ok(view.links.some((link) => link.kind === 'conflict'));
  assert.equal(view.pulse.kind, 'conflict');
});

test('the same projection produces stable node positions and ids', () => {
  const input = {
    phase: 'clarify_loop',
    caseFile: { facts: [{ id: 'one', value: '事实' }], unknowns: ['关键未知'] },
    projection: { agents: {}, evidence: {}, conflicts: [], activity: [] },
  };

  assert.deepEqual(buildArenaViewModel(input), buildArenaViewModel(input));
});

test('idle and direct answers keep the bagua quiet without decorative nodes', () => {
  const view = buildArenaViewModel({ phase: 'direct_answer', directResult: { answer: '2', lane: 'direct' } });

  assert.equal(view.mode, 'direct');
  assert.equal(view.core.label, '2');
  assert.equal(view.nodes.length, 0);
});

test('the visible arena prioritizes facts and the active unknown instead of stacking every node', () => {
  const view = buildArenaViewModel({
    phase: 'clarify_loop',
    caseFile: {
      facts: Array.from({ length: 3 }, (_, index) => ({ id: `f${index}`, value: `事实${index}` })),
      unknowns: Array.from({ length: 11 }, (_, index) => ({ id: `u${index}`, label: `未知${index}` })),
    },
  });

  const visible = selectVisibleArenaNodes(view);
  assert.equal(visible.filter((node) => node.kind === 'fact').length, 3);
  assert.ok(visible.some((node) => node.id === view.activeNodeId));
  assert.ok(visible.length <= 7);
});

test('central status hub exposes stage, active Agent, counts, and the next waiting party', () => {
  const view = buildArenaViewModel({
    phase: 'agent_debate',
    caseFile: {
      facts: [{ id: 'budget', value: '2000 元' }],
      unknowns: [{ id: 'commute', question: '通勤多久', blocking: true, status: 'open' }],
    },
    projection: {
      agents: { baby: { id: 'baby', agentName: '宝宝', status: 'running' } },
      evidence: { rent: { id: 'rent', summary: '租金证据', accepted: true } },
    },
  });

  assert.deepEqual(view.statusHub, {
    stage: '智囊独立判断',
    workingAgent: '宝宝',
    counts: { facts: 1, blockingUnknowns: 1, advisors: 1, evidence: 1 },
    waitingFor: '等待当前智囊完成，再由你决定是否插话',
  });
});
