export const SHARED_DEVICE_MARKER = 'yance:shared-device-mode';

const DEVICE_LOCAL_KEYS = new Set([
  'yance_theme',
  'yance_sound',
  'yance_volume',
  'yance_track_opt_out',
  'yance:visited',
  'use_deliberation_api',
  'yance:compass:pos',
  'yance:compass:mode',
  'yance:compass:hidden',
  'deliberation_base_cache',
  'deliberation_run_mode',
  'cyber_yan_api_circuit_until',
]);

const VISITOR_LOCAL_PREFIXES = [
  'yance_',
  'yance:',
  'divergence_',
];

const VISITOR_SESSION_PREFIXES = [
  'yance_',
  'yance:',
  'divergence_',
  'resume_',
];

function keysOf(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function removeMatching(storage, predicate) {
  let removed = 0;
  keysOf(storage).forEach((key) => {
    if (!predicate(key)) return;
    storage.removeItem(key);
    removed += 1;
  });
  return removed;
}

export function detectSharedDeviceMode({
  search = typeof window !== 'undefined' ? window.location.search : '',
  session = typeof window !== 'undefined' ? window.sessionStorage : null,
} = {}) {
  if (!session) return new URLSearchParams(search).get('kiosk') === '1';
  const value = new URLSearchParams(search).get('kiosk');
  if (value === '1') {
    session.setItem(SHARED_DEVICE_MARKER, '1');
    return true;
  }
  if (value === '0') {
    session.removeItem(SHARED_DEVICE_MARKER);
    return false;
  }
  return session.getItem(SHARED_DEVICE_MARKER) === '1';
}

export function resetSharedDeviceSession({
  local = typeof window !== 'undefined' ? window.localStorage : null,
  session = typeof window !== 'undefined' ? window.sessionStorage : null,
} = {}) {
  const localRemoved = local
    ? removeMatching(local, (key) => (
      !DEVICE_LOCAL_KEYS.has(key)
      && VISITOR_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))
    ))
    : 0;
  const sessionRemoved = session
    ? removeMatching(session, (key) => (
      key !== SHARED_DEVICE_MARKER
      && VISITOR_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))
    ))
    : 0;

  if (session) session.setItem(SHARED_DEVICE_MARKER, '1');
  return { localRemoved, sessionRemoved };
}

export function handoffSharedDevice() {
  resetSharedDeviceSession();
  window.location.replace('/sandbox?new=1&kiosk=1');
}
