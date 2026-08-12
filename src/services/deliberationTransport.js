export function resolveDeliberationTransport({ production = false, forced } = {}) {
  if (forced === 'poll' || forced === 'sse') return forced;
  return production ? 'poll' : 'sse';
}

export function pollDelay({ idle = true, idleCount = 0, failures = 0, hidden = false } = {}) {
  if (failures >= 6) return 60000;
  if (failures >= 4) return 30000;
  if (failures > 0) return Math.min(3000 * (2 ** (failures - 1)), 12000);
  if (!idle) return 1500;
  if (hidden) return 20000;
  return Math.min(3000 + Math.round(500 * (Math.max(1, idleCount) ** 1.5)), 12000);
}
