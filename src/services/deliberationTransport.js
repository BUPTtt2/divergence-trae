export function resolveDeliberationTransport({ production = false, forced } = {}) {
  if (forced === 'poll' || forced === 'sse') return forced;
  return production ? 'poll' : 'sse';
}

export function pollDelay({ idle = true, failures = 0 } = {}) {
  if (failures > 0) return Math.min(2000 * (2 ** (failures - 1)), 8000);
  return idle ? 2500 : 1500;
}
