import test from 'node:test';
import assert from 'node:assert/strict';

import { uniqueMessages, uniqueRoles } from './historyPresentation.js';

test('a role present in both virtual and active councils is rendered once', () => {
  const virtual = [{ id: 'jingyuan', name: '镜渊', role: 'virtual' }];
  const active = [{ id: 'jingyuan', name: '镜渊' }, { id: 'fengyan', name: '风眼' }];
  assert.deepEqual(uniqueRoles(virtual, active).map((role) => role.id), ['jingyuan', 'fengyan']);
});

test('identical history entries are presented once without mutating the source', () => {
  const source = ['同一段判断', '同一段  判断', '另一段判断'];
  assert.deepEqual(uniqueMessages(source), ['同一段判断', '另一段判断']);
  assert.equal(source.length, 3);
});
