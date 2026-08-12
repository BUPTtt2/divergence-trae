import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SHARED_DEVICE_MARKER,
  detectSharedDeviceMode,
  resetSharedDeviceSession,
} from './sharedDeviceSession.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

test('shared iPad handoff clears visitor identity and content but preserves device preferences', () => {
  const local = storage({
    yance_access_token: 'secret-token',
    yance_refresh_token: 'secret-refresh',
    yance_user: '{"id":"old-viewer"}',
    yance_anonymous_id: 'anon-old',
    yance_collection: '[{"id":"private-card"}]',
    'yance_notes_private-card': '["private note"]',
    'yance:memory:working': '["private memory"]',
    yance_theme: 'dark',
    yance_sound: 'enabled',
    yance_volume: '0.7',
    yance_track_opt_out: '1',
    'yance:visited': '1',
    use_deliberation_api: 'true',
    'yance:compass:pos': '{"x":12,"y":24}',
    deliberation_base_cache: 'https://runtime.example',
  });
  const session = storage({
    yance_active_deliberation_session: 'sess-old',
    resume_session_id: 'sess-old',
    yance_game_session: '{"question":"private"}',
    'yance:advisor-threads:sess-old': '["private thread"]',
    divergence_cost_session_v1_old: '{"tokens":1200}',
  });

  const result = resetSharedDeviceSession({ local, session });

  assert.deepEqual(local.snapshot(), {
    yance_theme: 'dark',
    yance_sound: 'enabled',
    yance_volume: '0.7',
    yance_track_opt_out: '1',
    'yance:visited': '1',
    use_deliberation_api: 'true',
    'yance:compass:pos': '{"x":12,"y":24}',
    deliberation_base_cache: 'https://runtime.example',
  });
  assert.deepEqual(session.snapshot(), { [SHARED_DEVICE_MARKER]: '1' });
  assert.equal(result.localRemoved, 7);
  assert.equal(result.sessionRemoved, 5);
});

test('shared device mode is restored from URL or the current tab marker', () => {
  const session = storage();

  assert.equal(detectSharedDeviceMode({ search: '?kiosk=1', session }), true);
  assert.equal(session.getItem(SHARED_DEVICE_MARKER), '1');
  assert.equal(detectSharedDeviceMode({ search: '', session }), true);
  assert.equal(detectSharedDeviceMode({ search: '?kiosk=0', session }), false);
  assert.equal(session.getItem(SHARED_DEVICE_MARKER), null);
});
