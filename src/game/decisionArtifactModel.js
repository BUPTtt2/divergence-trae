export function createDecisionArtifact(inference = {}, choices = []) {
  const findings = (Array.isArray(inference?.findings) ? inference.findings : [])
    .filter((finding) => String(finding?.claim || finding?.content || '').trim())
    .map((finding, index) => ({
      id: finding.findingId || finding.id || `finding_${index + 1}`,
      agentId: finding.agentId || '',
      agentName: finding.agentName || finding.agentId || `智囊 ${index + 1}`,
      perspective: finding.perspective || finding.stance || '独立视角',
      claim: String(finding.claim || finding.content).trim(),
      reasoning: String(finding.reasoning || '').trim(),
      assumptions: Array.isArray(finding.assumptions) ? finding.assumptions.filter(Boolean) : [],
      confidence: Number.isFinite(Number(finding.confidence)) ? Number(finding.confidence) : null,
      evidenceIds: Array.isArray(finding.evidenceIds) ? finding.evidenceIds : [],
      reversalConditions: Array.isArray(finding.reversalConditions) ? finding.reversalConditions : [],
    }));
  const paths = (Array.isArray(choices) ? choices : [])
    .filter((choice) => choice?.id && choice?.label)
    .map((choice) => {
      const declaredSource = String(choice.provenance || choice.source || '').toLowerCase();
      const generated = choice.fallback !== true && ['agent-evidence', 'model', 'model-generated', 'generated'].includes(declaredSource);
      return {
        ...choice,
        keyPoints: Array.isArray(choice.keyPoints) ? choice.keyPoints.filter(Boolean).slice(0, 3) : [],
        provenanceKind: generated ? 'generated' : 'fallback',
        provenanceLabel: generated ? '真实生成' : '规则兜底',
      };
    });
  const gaps = (Array.isArray(inference?.gaps) ? inference.gaps : []).map((gap) => ({
    perspective: gap?.perspective || gap?.name || '未覆盖事项',
    reason: gap?.reason || '本轮没有足够信息形成确定判断',
  }));
  const blocked = inference?.state === 'DELIBERATION_BLOCKED';
  return {
    blocked,
    summary: blocked ? '' : String(inference?.masterSummary || '').trim(),
    findings,
    gaps,
    paths: blocked ? [] : paths,
    oracle: blocked ? null : (inference?.oracle || null),
    contributionGate: inference?.contributionGate || null,
  };
}

export default createDecisionArtifact;
