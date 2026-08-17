import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplayTimeline, normalizeReplay } from './replayTimeline.js';

test('preserves the user question, every clarification, advisor message, selected path and commitment', () => {
  const replay = buildReplayTimeline({
    question: '要不要换工作？',
    answeredRounds: [
      { question: '你的底线是什么？', userAnswer: '不能降薪' },
      { question: '最晚什么时候决定？', userAnswer: '本周五' },
    ],
    agentDialogues: {
      history: {
        a1: [{ text: '先验证岗位预算。', eventId: 'evt-a1-1', source: 'execute-response' }],
        a2: ['先验证岗位预算。'],
        user: ['我还要补充：通勤不能超过一小时。'],
      },
    },
    activeAgents: [
      { id: 'a1', name: '镜渊' },
      { id: 'a2', name: '钱谷' },
    ],
    selectedChoice: { id: 'verify', label: '先验证再决定' },
    currentCommit: '周五前约谈招聘方',
  });

  assert.deepEqual(replay.events.map((event) => event.kind), [
    'user_question',
    'clarification_question',
    'clarification_answer',
    'clarification_question',
    'clarification_answer',
    'advisor_message',
    'advisor_message',
    'user_message',
    'path_selected',
    'commitment',
  ]);
  assert.equal(replay.events[2].text, '不能降薪');
  assert.equal(replay.events[5].speakerName, '镜渊');
  assert.equal(replay.events[6].speakerName, '钱谷');
  assert.equal(replay.events[7].text, '我还要补充：通勤不能超过一小时。');
  assert.equal(replay.schemaVersion, 2);
  assert.equal(replay.completeness, 'complete');
  assert.deepEqual(replay.events.map((event) => event.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('uses stable source ids for deduplication without collapsing equal words from different speakers', () => {
  const replay = buildReplayTimeline({
    agentDialogues: {
      history: {
        a1: [
          { text: '同一句判断', eventId: 'evt-1' },
          { text: '同一句判断', eventId: 'evt-1' },
        ],
        a2: [{ text: '同一句判断', eventId: 'evt-2' }],
      },
    },
    activeAgents: [{ id: 'a1', name: '甲' }, { id: 'a2', name: '乙' }],
  });

  assert.deepEqual(replay.events.map((event) => event.speakerName), ['甲', '乙']);
});

test('normalizes old and malformed replay data without inventing missing history', () => {
  assert.deepEqual(normalizeReplay(null), {
    schemaVersion: 1,
    completeness: 'partial',
    events: [],
  });

  const normalized = normalizeReplay(JSON.stringify({
    schemaVersion: 2,
    completeness: 'local_only',
    events: [
      { id: 'event-2', seq: 2, kind: 'advisor_message', speakerName: '镜渊', text: '后说' },
      { id: 'event-1', seq: 1, kind: 'user_question', speakerName: '我', text: '先问' },
      { id: '', seq: 3, kind: 'unknown', text: '' },
    ],
  }));

  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.completeness, 'local_only');
  assert.deepEqual(normalized.events.map((event) => event.text), ['先问', '后说']);
});
