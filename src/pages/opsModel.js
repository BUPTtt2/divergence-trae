function percentage(rate) {
  return Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : '暂无样本';
}

function minutes(milliseconds) {
  if (!Number.isFinite(milliseconds)) return null;
  const value = Math.max(0, Math.round(milliseconds / 60000));
  return `${value}分`;
}

export function buildOpsViewModel(data = {}) {
  const metrics = data.overview?.metrics || {};
  const completion = metrics.completionRate || { numerator: 0, denominator: 0, rate: null };
  const duration = metrics.durationMs || {};
  return {
    visitors: metrics.visitors ?? null,
    visits: metrics.visits ?? null,
    starts: metrics.starts ?? null,
    completions: metrics.completions ?? null,
    completion: {
      label: percentage(completion.rate),
      detail: `${completion.numerator || 0} / ${completion.denominator || 0} 局`,
      lowSample: (completion.denominator || 0) < 20,
    },
    duration: duration.samples > 0 ? `P50 ${minutes(duration.p50)} · P90 ${minutes(duration.p90)}` : '暂无可核对时长',
    funnel: data.funnel?.funnel || metrics.funnel || [],
    reliability: data.reliability?.reliability || metrics.reliability || {},
    sessions: data.sessions?.sessions || metrics.recentSessions || [],
    feedback: data.feedback?.feedback || [],
    feedbackSummary: metrics.feedbackSummary || { total: 0, helpful: 0, helpfulRate: { rate: null } },
    generatedAt: data.overview?.generatedAt || '',
  };
}

export default buildOpsViewModel;
