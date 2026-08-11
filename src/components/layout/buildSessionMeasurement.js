export function formatElapsed(elapsedMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function buildSessionMeasurement({ elapsedMs = 0, usageSummary = null, artwork = null } = {}) {
  const totalTokens = Number(usageSummary?.tokens?.total);
  return {
    elapsed: formatElapsed(elapsedMs),
    calls: Math.max(0, Number(usageSummary?.calls) || 0),
    failedCalls: Math.max(0, Number(usageSummary?.failedCalls) || 0),
    tokens: totalTokens > 0 ? totalTokens : null,
    image: artwork?.available && artwork?.source === 'seedream'
      ? 'Seedream 已生成'
      : artwork?.available
        ? '归档画面已生成'
        : '尚未生成',
  };
}

export default buildSessionMeasurement;
