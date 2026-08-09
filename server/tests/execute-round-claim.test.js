import test from 'node:test';
import assert from 'node:assert/strict';

import * as memoryService from '../src/services/memoryService.js';

test('a completed execute claim can advance to a new explicit user round', async () => {
  const session = await memoryService.saveSession({
    user_id: `round_owner_${Date.now()}`,
    question: '要不要吃饭',
    state: 'EXECUTE',
  });
  const first = await memoryService.claimExecute(session.id, { actionId: 'round_action_1' });
  assert.equal(first.claimed, true);
  await memoryService.completeExecute(session.id, {
    actionId: 'round_action_1',
    claimToken: first.claimToken,
    state: 'ROUND_REVIEW',
  });

  const replay = await memoryService.claimExecute(session.id, { actionId: 'round_action_1' });
  assert.equal(replay.claimed, false);

  const second = await memoryService.claimExecute(session.id, { actionId: 'round_action_2' });
  assert.equal(second.claimed, true);
  assert.notEqual(second.claimToken, first.claimToken);
});
