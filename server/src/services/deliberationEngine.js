/**
 * 真 Agent 架构 Step 2: 推演状态机总控（DeliberationEngine）
 *
 * 状态机：PLAN → WAIT → EXECUTE → REFLECT → ORACLE → COMMIT（按文档 4.3.1 节）
 *
 * Step 2 只跑通 start（PLAN → EXECUTE 骨架）：
 *   - start:  创建 session → 调 planner.plan() → 返回 { sessionId, state, plan, askUser }
 *   - answer: 占位（Step 4 实现 ASK 逻辑后，重新 plan）
 *   - execute:占位（Step 5 实现智囊并行调用）
 *   - commit:占位（Step 6 实现命签），当前调 memoryService.consolidate 固化记忆
 *   - getState:读取当前状态
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 3.1 / 3.2 / 4.3.1 / 4.3.2 / 6.3 / 7 节
 */

import * as planner from './planner.js';
import * as memoryService from './memoryService.js';
import logger from './logger.js';

// ============ 状态枚举 ============

export const STATES = {
  PLAN: 'PLAN',
  WAIT: 'WAIT',
  EXECUTE: 'EXECUTE',
  REFLECT: 'REFLECT',
  ORACLE: 'ORACLE',
  COMMIT: 'COMMIT',
};

// ============ 主入口 ============

/**
 * 发起推演：创建 session → 调 planner.plan() → 返回
 * 状态流转：PLAN → EXECUTE（Step 2 固定 CONTINUE，不追问）
 *
 * @param {string} question 用户问题
 * @param {string} userId 用户ID
 * @returns {Promise<{sessionId, state, plan, askUser}>}
 */
export async function start(question, userId) {
  logger.info('[Deliberation] start 开始', { question: (question || '').slice(0, 60), userId });

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new Error('缺少 question 参数');
  }
  if (question.length > 500) {
    throw new Error('问题过长，请控制在500字以内');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('缺少 userId 参数');
  }

  // 创建 session（snake_case 对齐 memoryService.saveSession）
  const session = {
    user_id: userId,
    question: question.trim(),
    state: STATES.PLAN,
    replan_count: 0,
  };

  // 调 planner.plan() —— 会读取记忆、生成维度、持久化 session、推进到 EXECUTE
  const { session: plannedSession, plan, askUser } = await planner.plan(session);

  logger.info('[Deliberation] start 完成', {
    sessionId: plannedSession.id,
    state: plannedSession.state,
    dimCount: plan?.dimensions?.length || 0,
    askUserCount: askUser?.length || 0,
  });

  return {
    sessionId: plannedSession.id,
    state: plannedSession.state,
    plan,
    askUser,
  };
}

/**
 * 用户回答追问：更新 session → 重新 plan → 返回
 * Step 2 占位：Step 4 实现 ASK 逻辑后接入，当前直接重新 plan 推进到 EXECUTE
 *
 * @param {string} sessionId
 * @param {Array} answers 用户回答数组
 * @returns {Promise<{sessionId, state, plan}>}
 */
export async function answer(sessionId, answers) {
  logger.info('[Deliberation] answer 收到', { sessionId, answerCount: Array.isArray(answers) ? answers.length : 0 });

  const session = await memoryService.getSession(sessionId);
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  // 记录用户回答（暂存到 memory_used 的扩展字段，Step 4 再细化）
  session.answers = answers || [];

  // 重新 plan（Step 4 会在此前接入 autonomyGate 判定）
  const { plan } = await planner.plan(session);

  logger.info('[Deliberation] answer 完成', {
    sessionId,
    state: session.state,
    dimCount: plan?.dimensions?.length || 0,
  });

  return {
    sessionId,
    state: session.state,
    plan,
  };
}

/**
 * 执行智囊推演（并行）
 * Step 2 占位：Step 5 实现，当前仅推进状态
 *
 * @param {string} sessionId
 * @param {Array} agentIds 指定调用的智囊ID
 * @returns {Promise<{sessionId, state, message}>}
 */
export async function execute(sessionId, agentIds) {
  logger.info('[Deliberation] execute 占位调用', { sessionId, agentIds });

  const session = await memoryService.getSession(sessionId);
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  // Step 5 将在此处并行调用智囊、收集 findings、进入 REFLECT
  // 当前仅占位返回
  return {
    sessionId,
    state: STATES.EXECUTE,
    message: '智囊调用待Step5实现',
  };
}

/**
 * 提交抉择：固化记忆、生成命签
 * Step 2 占位：Step 6 实现命签，当前调 memoryService.consolidate 完成记忆固化
 *
 * @param {string} sessionId
 * @param {string} choice 用户抉择
 * @param {string} feedback 用户反馈
 * @returns {Promise<{sessionId, fateTicket, memoryUpdated}>}
 */
export async function commit(sessionId, choice, feedback) {
  logger.info('[Deliberation] commit 收到', { sessionId, choice, feedback: (feedback || '').slice(0, 60) });

  const session = await memoryService.getSession(sessionId);
  if (!session) {
    throw new Error(`会话不存在: ${sessionId}`);
  }

  // 记录抉择（写入 session 供 consolidate 提取）
  try {
    await memoryService.updateSessionState(sessionId, STATES.COMMIT, {
      oracle: session.oracle || null,
      findings: session.findings || [],
      // choice 存到 findings 末尾便于 consolidate 读取（Step 6 会单独建列）
    });
  } catch (e) {
    logger.warn('[Deliberation] commit 状态更新失败', { error: e.message });
  }

  // 调 consolidate 固化记忆（L1→L2 摘要 + L3 命格提取）
  let memoryUpdated = false;
  try {
    const result = await memoryService.consolidate(sessionId);
    memoryUpdated = !!result;
    logger.info('[Deliberation] commit 记忆固化完成', {
      sessionId,
      summaryId: result?.summaryId,
      newMemories: result?.newMemories || 0,
    });
  } catch (e) {
    logger.warn('[Deliberation] commit 记忆固化失败', { error: e.message });
  }

  // Step 6 将在此处生成命签（fateTicket），当前返回 null
  return {
    sessionId,
    fateTicket: null,
    memoryUpdated,
  };
}

/**
 * 读取当前推演状态
 * @param {string} sessionId
 * @returns {Promise<object|null>} session 对象
 */
export async function getState(sessionId) {
  const session = await memoryService.getSession(sessionId);
  if (!session) {
    logger.warn('[Deliberation] getState 会话不存在', { sessionId });
    return null;
  }
  return session;
}

// ============ 自检 ============

/**
 * 自检：模拟 start('我要不要去西藏', 'test_user')
 * 期望：返回 sessionId + state='EXECUTE' + plan.dimensions 非空
 *
 * 跑法: node --input-type=module -e "import('./src/services/deliberationEngine.js').then(m=>m.selfTest())"
 *       （需在 server 目录、内存模式即可）
 */
export async function selfTest() {
  logger.info('=== DeliberationEngine selfTest 开始 ===');

  const question = '我要不要去西藏';
  const userId = `selftest_${Date.now()}`;

  const result = await start(question, userId);

  const ok =
    !!result.sessionId &&
    result.state === 'EXECUTE' &&
    Array.isArray(result.plan?.dimensions) &&
    result.plan.dimensions.length > 0;

  logger.info('=== DeliberationEngine selfTest 结果 ===', {
    ok,
    sessionId: result.sessionId,
    state: result.state,
    dimCount: result.plan?.dimensions?.length || 0,
    dims: result.plan?.dimensions?.map((d) => `${d.name}(${d.perspective})`),
    askUserCount: result.askUser?.length || 0,
  });

  if (!ok) {
    throw new Error(`selfTest 失败：sessionId=${result.sessionId}, state=${result.state}, dimCount=${result.plan?.dimensions?.length}`);
  }

  // 顺便验证 getState 能读回
  const restored = await getState(result.sessionId);
  if (!restored || restored.id !== result.sessionId) {
    throw new Error(`selfTest 失败：getState 读回异常 restored=${JSON.stringify(restored?.id)}`);
  }
  logger.info('=== DeliberationEngine selfTest getState 校验通过 ===', {
    restoredState: restored.state,
  });

  return { ok, sessionId: result.sessionId, state: result.state, dimCount: result.plan.dimensions.length };
}

export default {
  STATES,
  start,
  answer,
  execute,
  commit,
  getState,
  selfTest,
};
