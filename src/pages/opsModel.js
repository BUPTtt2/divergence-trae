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
  const costSummary = data.costs?.summary || {};
  const knownCost = Number(costSummary.estimatedCostCny || 0);
  const usageMissingCalls = Number(costSummary.costMissingCalls || costSummary.usageMissingCalls || 0);
  const providerSummary = costSummary.byProvider || {};
  const budgetRejected = Number(providerSummary['budget-gate']?.failedCalls || 0);
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
    publicFeedback: data.publicFeedback?.feedback || [],
    feedbackSummary: metrics.feedbackSummary || { total: 0, helpful: 0, helpfulRate: { rate: null } },
    costs: {
      calls: Number(costSummary.calls || 0),
      successfulCalls: Number(costSummary.successfulCalls || 0),
      failedCalls: Number(costSummary.failedCalls || 0),
      usageMissingCalls,
      tokens: costSummary.tokens || { input: 0, output: 0, total: 0 },
      knownCostLabel: `¥${knownCost.toFixed(4)}${usageMissingCalls > 0 ? ` + ${usageMissingCalls} 次价格未知` : ''}`,
      budgetRejected,
      capacity: {
        sessionTokenEnvelope: Number(data.costs?.capacity?.limits?.sessionTokenEnvelope || 0),
        userDailySessions: Number(data.costs?.capacity?.limits?.userDailySessions || 0),
        globalDailySessions: Number(data.costs?.capacity?.limits?.globalDailySessions || 0),
        maxActiveSessions: Number(data.costs?.capacity?.limits?.maxActiveSessions || 0),
        activeSessions: Number(data.costs?.capacity?.observed?.activeSessions || 0),
        settledSessions: Number(data.costs?.capacity?.observed?.settledSessions || 0),
        releasedSessions: Number(data.costs?.capacity?.observed?.releasedSessions || 0),
        p90ActualTokens: Number(data.costs?.capacity?.observed?.p90ActualTokens || 0),
      },
    },
    generatedAt: data.overview?.generatedAt || '',
  };
}

export default buildOpsViewModel;
