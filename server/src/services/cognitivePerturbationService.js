import crypto from 'node:crypto';

import { HEXAGRAM_LENSES } from '../data/hexagramLenses.js';

const INVARIANTS = Object.freeze({
  evidenceLocked: true,
  riskLocked: true,
  approvalLocked: true,
  userDecisionLocked: true,
});

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedInput({ oracle, findings, conflicts, gaps, dimensions, sessionSeed } = {}) {
  return {
    oracle: oracle || null,
    findings: Array.isArray(findings) ? findings : [],
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    gaps: Array.isArray(gaps) ? gaps : [],
    dimensions: Array.isArray(dimensions) ? dimensions : [],
    sessionSeed: sessionSeed ?? null,
  };
}

function sourceId(item, prefix, index) {
  const value = item?.id || item?.claimId || item?.perspective || item?.name || index + 1;
  return `${prefix}:${String(value)}`;
}

function selectLensId(oracle, sourceDigest) {
  const explicitId = oracle?.lensId ?? oracle?.hexagramId ?? oracle?.primary?.hexagramId ?? oracle?.primary?.id;
  if (Number.isInteger(explicitId) && explicitId >= 1 && explicitId <= 64) return explicitId;

  const binaryKey = oracle?.primary?.binaryKey;
  if (Number.isInteger(binaryKey) && binaryKey >= 0 && binaryKey <= 63) return binaryKey + 1;

  return (Number.parseInt(sourceDigest.slice(0, 8), 16) % 64) + 1;
}

function selectQuestion(lens, field, sourceDigest) {
  const questions = lens[field];
  const index = Number.parseInt(sourceDigest.slice(8, 16), 16) % questions.length;
  return questions[index];
}

function createTask(sourceDigest, sequence, kind, question, causedBy, targetPerspective) {
  const task = {
    id: `lens-task-${sourceDigest.slice(0, 16)}-${sequence}`,
    kind,
    question,
    causedBy,
  };
  if (targetPerspective) task.targetPerspective = targetPerspective;
  return task;
}

/**
 * 为已收束的推演补充最多三个可追溯的审查问题。
 * 不修改输入中的 findings、风险或审批数据。
 */
export function createCognitivePerturbationPlan(input = {}) {
  const normalized = normalizedInput(input);
  const sourceDigest = sha256(stableSerialize(normalized));
  const lensId = selectLensId(normalized.oracle, sourceDigest);
  const lens = HEXAGRAM_LENSES[lensId - 1];
  const reviewTasks = [];
  const add = (kind, field, causedBy, targetPerspective) => {
    if (reviewTasks.length >= 3 || causedBy.length === 0) return;
    reviewTasks.push(createTask(
      sourceDigest,
      reviewTasks.length + 1,
      kind,
      selectQuestion(lens, field, sourceDigest),
      causedBy,
      targetPerspective,
    ));
  };

  const primaryConflict = normalized.conflicts[0];
  const primaryGap = normalized.gaps[0];
  const unknownFinding = normalized.findings.find((finding) => finding?.evidenceStatus === 'unknown');
  const primaryUnknown = primaryGap || unknownFinding;

  if (primaryConflict) {
    add('failure-mode', 'failureModes', [`lens:${lensId}`, sourceId(primaryConflict, 'conflict', 0)], primaryConflict.perspective);
  }
  if (primaryUnknown) {
    add('assumption', 'reviewQuestions', [
      `lens:${lensId}`,
      sourceId(primaryUnknown, primaryGap ? 'gap' : 'finding', 0),
    ], primaryUnknown.perspective);
  }
  if (normalized.oracle?.dynamics?.length > 0 && (primaryConflict || primaryUnknown)) {
    const causalSource = primaryConflict
      ? sourceId(primaryConflict, 'conflict', 0)
      : sourceId(primaryUnknown, primaryGap ? 'gap' : 'finding', 0);
    add('counterfactual', 'counterfactualPrompts', [
      `lens:${lensId}`,
      causalSource,
      `oracle:dynamic:${normalized.oracle.dynamics[0]}`,
    ]);
  }
  if (reviewTasks.length === 0 && normalized.findings.length > 0) {
    add('exit-condition', 'exitConditions', [`lens:${lensId}`, sourceId(normalized.findings[0], 'finding', 0)], normalized.findings[0]?.perspective);
  }

  return {
    lensId,
    lensName: lens.name,
    source: 'session-derived',
    sourceDigest,
    reviewTasks,
    invariants: { ...INVARIANTS },
  };
}

function findingTaskId(finding) {
  return finding?.lensTaskId || finding?.taskId || finding?.relatedTaskId || null;
}

function provenOutcome(findings) {
  if (findings.some((finding) => (
    finding?.evidenceStatus === 'accepted'
    && (finding?.evidenceId || finding?.evidence)
  ))) return 'evidence-added';
  if (findings.some((finding) => finding?.challengedClaimId || finding?.claimChallenged)) return 'claim-challenged';
  if (findings.some((finding) => finding?.exitCondition || finding?.exitConditionAdded)) return 'exit-condition-added';
  return 'no-change';
}

/**
 * 只记录能够关联到既有 finding 的 Lens 影响；未知影响明确写为 no-change。
 */
export function createLensImpactRecords(plan, findings) {
  const tasks = Array.isArray(plan?.reviewTasks) ? plan.reviewTasks : [];
  const existingFindings = Array.isArray(findings) ? findings.filter(Boolean) : [];

  return tasks.map((task) => {
    const linked = existingFindings.filter((finding) => findingTaskId(finding) === task.id && finding.id);
    const outcome = provenOutcome(linked);
    const findingIds = [...new Set(linked.map((finding) => finding.id))];
    const summary = outcome === 'no-change'
      ? '暂无可证明影响。'
      : `已关联 ${findingIds.length} 条已有 finding，记录了可追溯的 ${outcome}。`;

    return {
      taskId: task.id,
      lensId: plan?.lensId,
      outcome,
      findingIds,
      summary,
    };
  });
}
