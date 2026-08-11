import test from 'node:test';
import assert from 'node:assert/strict';

import { createDecisionArtifact } from './decisionArtifactModel.js';

test('decision artifact keeps findings, uncertainty and business paths in one model', () => {
  const artifact = createDecisionArtifact({
    state: 'ORACLE',
    masterSummary: '先区分身体饥饿与减脂目标，再选择可逆行动。',
    findings: [{ agentId: 'health', agentName: '衡生', content: '若非饥饿，可先喝水等待十分钟。', confidence: 0.72 }],
    gaps: [{ perspective: 'medical', reason: '没有症状信息' }],
  }, [{ id: 'wait', label: '先等十分钟', keyPoints: ['喝水', '十分钟后复评'], provenance: 'agent-evidence' }]);

  assert.equal(artifact.findings[0].agentName, '衡生');
  assert.equal(artifact.gaps[0].perspective, 'medical');
  assert.equal(artifact.paths[0].provenanceLabel, '真实生成');
});

test('blocked deliberation cannot expose summary, oracle or paths', () => {
  const artifact = createDecisionArtifact({
    state: 'DELIBERATION_BLOCKED',
    masterSummary: '不应显示',
    oracle: { text: '不应显示' },
  }, [{ id: 'fake', label: '不应显示' }]);

  assert.equal(artifact.blocked, true);
  assert.equal(artifact.summary, '');
  assert.equal(artifact.oracle, null);
  assert.deepEqual(artifact.paths, []);
});

test('decision paths expose whether they were model-generated or controlled fallback', () => {
  const artifact = createDecisionArtifact({}, [
    { id: 'generated', label: '先做一周小实验', provenance: 'agent-evidence' },
    { id: 'fallback', label: '保持现状', provenance: 'controlled-fallback' },
  ]);

  assert.deepEqual(artifact.paths.map((path) => ({
    kind: path.provenanceKind,
    label: path.provenanceLabel,
  })), [
    { kind: 'generated', label: '真实生成' },
    { kind: 'fallback', label: '规则兜底' },
  ]);
});
