function text(value) {
  return String(value || '').trim();
}

export function createCaseRevisionDraft(caseFile = {}) {
  return {
    facts: Object.fromEntries((caseFile.facts || []).map((item, index) => [item.id || `fact_${index}`, text(item.value)])),
    understanding: text(caseFile.understanding),
    unknowns: Object.fromEntries((caseFile.unknowns || []).map((item, index) => [item.id || `unknown_${index}`, text(item.question)])),
  };
}

export function serializeCaseCorrections(caseFile = {}, draft = {}) {
  const changes = [];
  (caseFile.facts || []).forEach((item, index) => {
    const id = item.id || `fact_${index}`;
    const before = text(item.value);
    const after = text(draft.facts?.[id]);
    if (after && after !== before) changes.push(`纠正事实“${text(item.question) || id}”：${before} → ${after}`);
  });
  const beforeUnderstanding = text(caseFile.understanding);
  const afterUnderstanding = text(draft.understanding);
  if (afterUnderstanding && afterUnderstanding !== beforeUnderstanding) {
    changes.push(`纠正系统理解：${beforeUnderstanding} → ${afterUnderstanding}`);
  }
  (caseFile.unknowns || []).forEach((item, index) => {
    const id = item.id || `unknown_${index}`;
    const before = text(item.question);
    const after = text(draft.unknowns?.[id]);
    if (after && after !== before) changes.push(`纠正未知“${id}”：${before} → ${after}`);
  });
  return changes.join('\n');
}

export default { createCaseRevisionDraft, serializeCaseCorrections };
