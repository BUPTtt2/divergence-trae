const PROVENANCE = Object.freeze({
  model: {
    kind: 'model-with-rule-gate',
    label: '模型补充 · 含规则校验',
    detail: '模型结合本局生成补充项，基础事实仍由规则校验兜底。',
  },
  'retained-analysis-fallback': {
    kind: 'retained-fallback',
    label: '沿用案卷 · 规则保底',
    detail: '本批沿用已确认案卷，并用规则补足必要事实。',
  },
  'safety-fallback': {
    kind: 'rule-gate',
    label: '规则安全校验',
    detail: '模型未完成本批生成，系统只核对会改变判断的关键事实。',
  },
});

export function clarificationProvenance(inference = {}) {
  if (inference?.fallback === true) return PROVENANCE['safety-fallback'];
  const source = inference?.plan?.caseAnalysis?.source || inference?.caseAnalysis?.source;
  return PROVENANCE[source] || {
    kind: 'unknown',
    label: '来源待核验',
    detail: '当前响应尚未返回可验证的生成来源。',
  };
}

export default clarificationProvenance;
