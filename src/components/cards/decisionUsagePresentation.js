const format = (value) => new Intl.NumberFormat('zh-CN').format(Math.max(0, Number(value) || 0));

export function decisionUsagePresentation(summary = {}) {
  const calls = Math.max(0, Number(summary.calls) || 0);
  const failures = Math.max(0, Number(summary.failedCalls) || 0);
  const retries = Math.max(0, Number(summary.retryCalls) || 0);
  const missing = Math.max(0, Number(summary.usageMissingCalls) || 0);
  const costMissing = Math.max(0, Number(summary.costMissingCalls) || 0);
  const total = Math.max(0, Number(summary.tokens?.total) || 0);
  const parts = [`${calls} 次调用`];
  if (failures) parts.push(`${failures} 次失败`);
  if (retries) parts.push(`${retries} 次切换`);
  return {
    total: format(total),
    input: format(summary.tokens?.input),
    output: format(summary.tokens?.output),
    calls: parts.join(' · '),
    cost: costMissing > 0 ? '成本待按模型单价核算' : `约 ¥${Math.max(0, Number(summary.estimatedCostCny) || 0).toFixed(4)}`,
    measured: calls > 0 && total > 0 && missing < calls,
  };
}

export default { decisionUsagePresentation };
