const FALLBACK_SOURCE = /fallback|preset|local|controlled|offline|rules/i;

function clean(value, limit) {
  const text = String(value || '')
    .replace(/[_*#`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, limit);
}

function normalizeActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clean(item?.label || item?.title || item?.text || item, 20))
    .filter(Boolean)
    .slice(0, 3);
}

function isFallbackResult(fateContent, inference) {
  if (inference?.fallback === true || fateContent?.fallback === true) return true;
  return FALLBACK_SOURCE.test([
    fateContent?.source,
    inference?.source,
    inference?.plan?.recommendation?.source,
  ].filter(Boolean).join(' '));
}

export function buildFateCardPresentation({
  fateContent = null,
  inference = null,
  selectedChoice = null,
  question = '',
} = {}) {
  const fallback = isFallbackResult(fateContent, inference);
  const choice = selectedChoice || fateContent?.path || null;
  const actions = normalizeActions(
    fateContent?.keyPoints
      || fateContent?.actions
      || choice?.keyPoints
      || choice?.steps,
  );

  return {
    question: clean(fateContent?.question || question || choice?.question, 32),
    title: clean(fateContent?.cardCopy?.sealTitle || fateContent?.choice || choice?.label || fateContent?.title, 24),
    summary: clean(fateContent?.cardCopy?.verdict || fateContent?.summary || inference?.masterSummary || inference?.summary, 56),
    actions,
    sourceMark: fallback ? '藏' : '灵',
    sourceLabel: fallback ? '离线推演结果' : '由模型根据本局案卷生成',
  };
}
