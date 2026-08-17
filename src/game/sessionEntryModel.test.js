import test from 'node:test';
import assert from 'node:assert/strict';

import { sessionEntryAction } from './sessionEntryModel.js';

test('normal visitors preserve identity while kiosk handoff isolates the next visitor', () => {
  assert.deepEqual(sessionEntryAction({ kiosk: false, hasActiveSession: true }), {
    label: '新开推演',
    description: '当前进度会保留为未完成推演',
    destructive: false,
    mode: 'new-deliberation',
  });
  assert.deepEqual(sessionEntryAction({ kiosk: false, hasActiveSession: false }), {
    label: '新开推演',
    description: '建立一份新的决策案卷',
    destructive: false,
    mode: 'new-deliberation',
  });
  assert.deepEqual(sessionEntryAction({ kiosk: true, hasActiveSession: true }), {
    label: '下一位 · 开新局',
    description: '清除此设备上的本位访客内容',
    destructive: true,
    mode: 'kiosk-handoff',
  });
});
