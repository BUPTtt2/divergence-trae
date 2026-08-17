import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplaySections, findReplayCard } from './collectionReplayModel.js';

const events = [
  { id: '1', seq: 1, phase: 'input', kind: 'user_question', speakerType: 'user', speakerName: '我', text: '原始问题' },
  { id: '2', seq: 2, phase: 'clarify_loop', kind: 'clarification_question', speakerType: 'system', speakerName: '演', text: '第一个问题' },
  { id: '3', seq: 3, phase: 'clarify_loop', kind: 'clarification_answer', speakerType: 'user', speakerName: '我', text: '第一个回答' },
  { id: '4', seq: 4, phase: 'agent_debate', kind: 'advisor_message', speakerType: 'advisor', speakerName: '镜渊', text: '智囊意见' },
  { id: '5', seq: 5, phase: 'agent_debate', kind: 'advisor_failed', speakerType: 'advisor', speakerName: '钱谷', text: '本轮超时' },
  { id: '6', seq: 6, phase: 'branch_select', kind: 'path_selected', speakerType: 'user', speakerName: '我', text: '先验证' },
  { id: '7', seq: 7, phase: 'committing', kind: 'commitment', speakerType: 'user', speakerName: '我', text: '周五行动' },
];

test('groups every original event chronologically without dropping user speech or failures', () => {
  const result = buildReplaySections(events, 'all');

  assert.deepEqual(result.sections.map((section) => section.phase), [
    'input', 'clarify_loop', 'agent_debate', 'branch_select', 'committing',
  ]);
  assert.deepEqual(result.sections.flatMap((section) => section.events).map((event) => event.text), events.map((event) => event.text));
  assert.deepEqual(result.counts, { all: 7, user: 4, system: 1, advisor: 2, failures: 1 });
});

test('speaker filters change presentation only and keep the source array untouched', () => {
  const before = structuredClone(events);
  const user = buildReplaySections(events, 'user');
  const advisors = buildReplaySections(events, 'advisor');

  assert.deepEqual(user.sections.flatMap((section) => section.events).map((event) => event.text), [
    '原始问题', '第一个回答', '先验证', '周五行动',
  ]);
  assert.deepEqual(advisors.sections.flatMap((section) => section.events).map((event) => event.text), ['智囊意见', '本轮超时']);
  assert.deepEqual(events, before);
});

test('finds a replay card by cloud id, local id, ticket id or source session', () => {
  const cards = [
    { id: 'cloud-1', sourceSessionId: 'session-1', ticketId: 'ticket-1' },
    { id: 'local-2', source_session_id: 'session-2' },
  ];

  assert.equal(findReplayCard(cards, 'cloud-1'), cards[0]);
  assert.equal(findReplayCard(cards, 'session-1'), cards[0]);
  assert.equal(findReplayCard(cards, 'ticket-1'), cards[0]);
  assert.equal(findReplayCard(cards, 'session-2'), cards[1]);
  assert.equal(findReplayCard(cards, 'missing'), null);
});
