import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionCard, normalizeDecisionCard } from './decisionCardContract.js';

test('final artifact and collection normalize through one decision-card contract', () => {
  const created = createDecisionCard({
    id: 'session-1',
    question: '要不要搬家',
    decision: '先试住两周',
    summary: '保留退路后小步验证',
    oracle: {
      primary: { lower: { name: '坎' }, upper: { name: '艮' } },
      changed: { lower: { name: '兑' }, upper: { name: '艮' } },
      mutual: { lower: { name: '震' }, upper: { name: '坎' } },
      opposite: { lower: { name: '离' }, upper: { name: '兑' } },
    },
    advisors: ['风险智囊'],
  });
  const normalized = normalizeDecisionCard({ ...created, advisors: JSON.stringify(created.advisors) });

  assert.equal(normalized.gua, '坎艮');
  assert.equal(normalized.hexagrams.changed, '兑艮');
  assert.equal(normalized.hexagrams.mutual, '震坎');
  assert.equal(normalized.hexagrams.opposite, '离兑');
  assert.deepEqual(normalized.advisors, ['风险智囊']);
  assert.match(normalized.disclaimer, /不替代事实和用户决定/);
});

test('decision card treats a null oracle as an unfinished mirror instead of crashing', () => {
  const created = createDecisionCard({
    question: '今天要不要吃晚饭',
    decision: '先确认是否真的饥饿',
    oracle: null,
  });

  assert.equal(created.gua, '本卦');
  assert.equal(created.trigram, '☯');
  assert.deepEqual(created.hexagrams, {
    primary: '本卦',
    changed: '',
    mutual: '',
    opposite: '',
  });
});

test('decision card normalizes Replay V2 and marks historical cards as partial', () => {
  const current = normalizeDecisionCard({
    id: 'card-with-replay',
    replay: JSON.stringify({
      schemaVersion: 2,
      completeness: 'complete',
      events: [{ id: 'evt-1', seq: 1, kind: 'user_question', speakerName: '我', text: '要不要换工作？' }],
    }),
  });
  const historical = normalizeDecisionCard({ id: 'card-without-replay' });

  assert.equal(current.replay.schemaVersion, 2);
  assert.equal(current.replay.completeness, 'complete');
  assert.equal(current.replay.events[0].text, '要不要换工作？');
  assert.deepEqual(historical.replay, {
    schemaVersion: 1,
    completeness: 'partial',
    events: [],
  });
});
