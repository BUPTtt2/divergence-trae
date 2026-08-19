import test from 'node:test';
import assert from 'node:assert/strict';

import { exportAccountData } from '../src/services/accountDataService.js';

test('account export is owner-scoped and never returns password or token material', async () => {
  const calls = [];
  const queryImpl = async (operation) => {
    calls.push(operation);
    if (operation.table === 'users') return { rows: [{ id: 'user-1', email: 'user@example.com', nickname: '演者', password_hash: 'secret' }] };
    if (operation.table === 'refresh_tokens') return { rows: [{ id: 'refresh-1', token_hash: 'secret' }] };
    if (operation.table === 'cards') return { rows: [{ id: 'card-1', user_id: 'user-1', title: '命牌' }] };
    return { rows: [] };
  };
  const result = await exportAccountData('user-1', { queryImpl, now: () => 1_787_000_000_000 });
  assert.equal(result.profile.email, 'user@example.com');
  assert.equal(result.data.cards[0].title, '命牌');
  assert.equal(JSON.stringify(result).includes('password_hash'), false);
  assert.equal(JSON.stringify(result).includes('token_hash'), false);
  assert.equal(calls.some((call) => call.table === 'refresh_tokens'), false);
  assert.equal(calls.every((call) => Object.values(call.filter || {}).includes('user-1') || call.table === 'users'), true);
});
