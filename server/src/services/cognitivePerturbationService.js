import crypto from 'node:crypto';

import BaseAgent from '../agents/BaseAgent.js';
import { run as runAgent } from '../agents/AgentRunner.js';
import { AGENT_POOL } from '../data/agentPool.js';
import { HEXAGRAM_LENSES } from '../data/hexagramLenses.js';
import { callLLM } from './llmRouter.js';
import logger from './logger.js';

const INVARIANTS = Object.freeze({
  evidenceLocked: true,
  riskLocked: true,
  approvalLocked: true,
  userDecisionLocked: true,
});

// binaryKey 的 bit0 是初爻、bit5 是上爻；值本身不是文王卦序。
const KING_WEN_ID_BY_BINARY_KEY = Object.freeze([
  2, 24, 7, 19, 15, 36, 46, 11, 16, 51, 40, 54, 62, 55, 32, 34,
  8, 3, 29, 60, 39, 63, 48, 5, 45, 17, 47, 58, 31, 49, 28, 43,
  23, 27, 4, 41, 52, 22, 18, 26, 35, 21, 64, 38, 56, 30, 50, 14,
  20, 42, 59, 61, 53, 37, 57, 9, 12, 25, 6, 10, 33, 13, 44, 1,
]);

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
  if (Number.isInteger(binaryKey) && binaryKey >= 0 && binaryKey <= 63) {
    return KING_WEN_ID_BY_BINARY_KEY[binaryKey];
  }

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

/** 只记录有实际关联 finding 且产生可证明结果的 Lens 影响。 */
export function createLensImpactRecords(plan, findings) {
  const tasks = Array.isArray(plan?.reviewTasks) ? plan.reviewTasks : [];
  const existingFindings = Array.isArray(findings) ? findings.filter(Boolean) : [];

  return tasks.flatMap((task) => {
    const linked = existingFindings.filter((finding) => findingTaskId(finding) === task.id && finding.id);
    const outcome = provenOutcome(linked);
    const findingIds = [...new Set(linked.map((finding) => finding.id))];
    if (outcome === 'no-change' || findingIds.length === 0) return [];

    return [{
      taskId: task.id,
      lensId: plan?.lensId,
      outcome,
      findingIds,
      summary: `已关联 ${findingIds.length} 条已有 finding，记录了可追溯的 ${outcome}。`,
    }];
  });
}

const PERSPECTIVE_AGENT_IDS = Object.freeze({
  strategic: 'luxiang',
  career: 'luxiang',
  financial: 'qiangu',
  risk: 'fengyan',
  emotional: 'xinhe',
  reflection: 'jingyuan',
  macro: 'yuntu',
  action: 'zhenxing',
  practical: 'zhenxing',
  experience: 'zhenxing',
  communication: 'duiyan',
  legal: 'falv',
  health: 'jiankang',
  education: 'jiaoyu',
  technical: 'jishu',
});

function advisorForTask(task) {
  const preferredId = PERSPECTIVE_AGENT_IDS[String(task?.targetPerspective || '').trim().toLowerCase()];
  if (preferredId) return AGENT_POOL.find((advisor) => advisor.id === preferredId) || AGENT_POOL[0];
  const index = Number.parseInt(sha256(String(task?.id || '')).slice(0, 8), 16) % AGENT_POOL.length;
  return AGENT_POOL[index];
}

function stableFindingId(sessionId, lensId, taskId) {
  return `lens-finding-${sha256(`${sessionId}|${lensId}|${taskId}`).slice(0, 20)}`;
}

function stableTaskActionId(baseActionId, sessionId, taskId) {
  const root = String(baseActionId || '').trim() || `session-${sessionId}`;
  return `${root}:lens:${taskId}`;
}

class LensAdvisorAdapter extends BaseAgent {
  constructor(advisor, task, callLLMFn) {
    super({ id: advisor.id, name: advisor.name, role: 'advisor', timeoutMs: 12000, retries: 0 });
    this.advisor = advisor;
    this.task = task;
    this.callLLMFn = callLLMFn;
  }

  async _execute(ctx) {
    const input = ctx.blackboard;
    const messages = [
      {
        role: 'system',
        content: `${this.advisor.persona || this.advisor.identity || this.advisor.name}\n你正在执行认知扰动审查。只输出一条待核验的 claim challenge 或退出条件；不得声称获得新证据，不得改变风险、审批、用户选择或给出行动裁决。`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          originalQuestion: input.originalQuestion,
          reviewQuestion: this.task.question,
          kind: this.task.kind,
          causedBy: this.task.causedBy,
          existingFindings: input.existingFindings,
          safetyConstraints: input.safetyConstraints,
        }),
      },
    ];
    const text = await this.callLLMFn(messages, {
      maxTokens: 220,
      temperature: 0,
      timeout: 8000,
      signal: ctx.signal,
    });
    if (ctx.signal?.aborted) throw new Error('Lens advisor aborted');
    const normalized = String(text || '').trim().slice(0, 800);
    if (!normalized) throw new Error('Lens advisor unavailable');
    return { text: normalized };
  }
}

function impactForFinding(plan, task, finding) {
  const outcome = task.kind === 'exit-condition' ? 'exit-condition-added' : 'claim-challenged';
  return {
    taskId: task.id,
    lensId: plan.lensId,
    outcome,
    findingIds: [finding.id],
    summary: outcome === 'exit-condition-added'
      ? '新增一条待核验的退出条件。'
      : '新增一条待核验的主张挑战。',
  };
}

/**
 * 通过既有 Advisor + AgentRunner 执行最多三项 Lens 审查。
 * 失败任务保持 pending；只追加未知 finding，不修改既有业务与安全数据。
 */
export async function executeLensReviewTasks({ session, plan, actionId } = {}, dependencies = {}) {
  const tasks = Array.isArray(plan?.reviewTasks) ? plan.reviewTasks.slice(0, 3) : [];
  const findings = [...(Array.isArray(session?.findings) ? session.findings : [])];
  const impacts = [...(Array.isArray(session?.lensImpacts) ? session.lensImpacts : [])];
  const assignments = [];
  const callLLMFn = dependencies.callLLMFn || callLLM;
  const runAgentFn = dependencies.runAgentFn || runAgent;
  const statusByTaskId = new Map();

  for (const task of tasks) {
    const advisor = advisorForTask(task);
    const taskActionId = stableTaskActionId(actionId, session?.id, task.id);
    const agent = new LensAdvisorAdapter(advisor, task, callLLMFn);
    assignments.push({ taskId: task.id, agentId: advisor.id, actionId: taskActionId, agent });

    const existingFinding = findings.find((finding) => (
      finding?.lensTaskId === task.id && finding?.lensId === plan?.lensId
    ));
    const existingImpact = impacts.find((impact) => impact?.taskId === task.id && impact?.findingIds?.includes(existingFinding?.id));
    if (existingFinding && existingImpact) {
      statusByTaskId.set(task.id, 'completed');
      continue;
    }

    try {
      const runResult = await runAgentFn(agent, {
        sessionId: session.id,
        userId: session.user_id,
        round: Number(session.round || 0),
        actionId: taskActionId,
        blackboard: {
          originalQuestion: session.question,
          existingFindings: findings.map((finding) => ({
            id: finding.id,
            perspective: finding.perspective,
            content: finding.content,
            evidenceStatus: finding.evidenceStatus,
          })),
          safetyConstraints: {
            evidenceLocked: true,
            riskLocked: true,
            approvalLocked: true,
            userDecisionLocked: true,
          },
        },
      });
      const outputText = String(runResult?.output?.text || '').trim();
      if (!runResult?.ok || !outputText) throw new Error('Lens advisor returned no review');
      const finding = {
        id: stableFindingId(session.id, plan.lensId, task.id),
        agentId: advisor.id,
        agentName: advisor.name,
        perspective: task.targetPerspective || 'unspecified',
        dimension: task.targetPerspective || 'unspecified',
        content: task.kind === 'exit-condition'
          ? `待核验退出条件：${outputText}`
          : `待核验主张挑战：${outputText}`,
        stance: 'neutral',
        evidenceStatus: 'unknown',
        verificationStatus: 'unverified',
        lensTaskId: task.id,
        lensId: plan.lensId,
        source: 'lens-review',
        ...(task.kind === 'exit-condition'
          ? { exitCondition: outputText }
          : { claimChallenged: true }),
        ts: Date.now(),
      };
      if (!findings.some((item) => item.id === finding.id)) findings.push(finding);
      if (!impacts.some((impact) => impact.taskId === task.id)) impacts.push(impactForFinding(plan, task, finding));
      statusByTaskId.set(task.id, 'completed');
    } catch (error) {
      statusByTaskId.set(task.id, 'pending');
      logger.warn('[LensReviewExecutor] task 保持 pending', {
        sessionId: session?.id,
        taskId: task.id,
        agentId: advisor.id,
        error: error.message,
      });
    }
  }

  const reviewedTaskIds = new Set(tasks.map((task) => task.id));
  const nextPlan = {
    ...plan,
    reviewTasks: (Array.isArray(plan?.reviewTasks) ? plan.reviewTasks : []).map((task) => (
      reviewedTaskIds.has(task.id)
        ? { ...task, status: statusByTaskId.get(task.id) || 'pending' }
        : task
    )),
  };
  return { plan: nextPlan, findings, impacts, assignments };
}
