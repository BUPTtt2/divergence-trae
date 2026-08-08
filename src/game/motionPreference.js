const MODES = new Set(['standard', 'reduced', 'off']);

export function effectiveMotionMode(selectedMode, prefersReduced) {
  const mode = MODES.has(selectedMode) ? selectedMode : 'standard';
  if (mode === 'off') return 'off';
  if (prefersReduced) return 'reduced';
  return mode;
}

export function resolveMotionMode(savedMode, prefersReduced) {
  return effectiveMotionMode(savedMode, prefersReduced);
}

export function motionConfigFor(mode, cueKind) {
  if (mode === 'off') return { enabled: false, duration: 0, intensity: 0 };
  if (mode === 'reduced') return { enabled: true, duration: 0.35, intensity: 0.25 };
  const duration = cueKind === 'crystallize' ? 2.2 : (cueKind === 'replan' ? 1.8 : 0.8);
  return { enabled: true, duration, intensity: 1 };
}

export default { effectiveMotionMode, resolveMotionMode, motionConfigFor };
