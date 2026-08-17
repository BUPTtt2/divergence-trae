import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDecisionCards, readLocalDecisionCards, writeLocalDecisionCard } from './decisionCollectionStore.js';

function withLocalStorage(run) {
  const data = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
  try { return run(); } finally { globalThis.localStorage = previous; }
}

test('local decision storage preserves complete replay events', () => withLocalStorage(() => {
  writeLocalDecisionCard({
    sourceSessionId: 'session-replay-1',
    title: '先验证',
    replay: {
      schemaVersion: 2,
      completeness: 'complete',
      events: [
        { id: 'evt-1', seq: 1, kind: 'user_question', speakerName: '我', text: '原始问题' },
        { id: 'evt-2', seq: 2, kind: 'clarification_answer', speakerName: '我', text: '原始回答' },
      ],
    },
  });

  const [stored] = readLocalDecisionCards();
  assert.equal(stored.replay.events.length, 2);
  assert.equal(stored.replay.events[1].text, '原始回答');
}));

test('cloud merge cannot erase a complete local replay with an absent remote replay', () => {
  const [merged] = mergeDecisionCards(
    [{ id: 'remote-id', source_session_id: 'session-replay-2', title: '云端标题' }],
    [{ sourceSessionId: 'session-replay-2', replay: {
      schemaVersion: 2,
      completeness: 'complete',
      events: [{ id: 'evt-1', seq: 1, kind: 'user_question', text: '保留我' }],
    } }],
  );

  assert.equal(merged.title, '云端标题');
  assert.equal(merged.replay.events[0].text, '保留我');
});
