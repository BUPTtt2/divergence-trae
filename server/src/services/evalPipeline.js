/**
 * P1 Eval Pipeline 最小版
 *
 * 在推演 commit 完成后异步评估智囊发言质量，4 项指标每项 1-5 分：
 *  1. relevance      相关性：智囊发言是否与问题相关
 *  2. diversity      多元性：是否覆盖多个视角
 *  3. no_hallucination 无幻觉：是否有事实错误（5 分=无错误）
 *  4. actionability  可操作性：建议是否具体可执行
 *
 * 设计约束：
 *  - 5s 超时，失败不阻塞主流程（commit 不 await）
 *  - 评估结果写入 session_eval 表（db.js 白名单）
 *  - LLM 不可用或返回非法 JSON 时降级跳过，不抛错
 *
 * 接口：
 *  - evaluateSession(sessionId) → Promise<{sessionId, relevance, diversity, no_hallucination, actionability} | null>
 *
 * 跑法: cd server && node --input-type=module -e "import('./src/services/evalPipeline.js').then(m=>console.log('OK',typeof m.evaluateSession))"
 */

import { getSession } from './memoryService.js';
import { callLLM } from './llmRouter.js';
import { query } from './db.js';
import logger from './logger.js';

// ============ 常量 ============

const EVAL_TIMEOUT_MS = 5000;

const EVAL_METRICS = [
  'relevance',
  'diversity',
  'no_hallucination',
  'actionability',
];

// ============ 主入口 ============

/**
 * 评估一次推演会话的质量（4 项指标 1-5 分）
 * 5s 超时，失败不阻塞（调用方应不 await）
 * @param {string} sessionId
 * @returns {Promise<object|null>} 评估结果，失败返回 null
 */
export async function evaluateSession(sessionId) {
  try {
    if (!sessionId) {
      logger.warn('[EvalPipeline] 缺少 sessionId');
      return null;
    }

    const session = await getSession(sessionId);
    if (!session) {
      logger.warn('[EvalPipeline] session 不存在', { sessionId });
      return null;
    }

    const findings = Array.isArray(session.findings) ? session.findings : [];
    const oracle = session.oracle || null;
    const question = session.questionContext || session.question || '';

    // 无 findings 无法评估多元性等指标，直接跳过
    if (findings.length === 0) {
      logger.info('[EvalPipeline] 无 findings，跳过评估', { sessionId });
      return null;
    }

    // 组装评估上下文
    const findingsText = findings
      .map((f) => {
        const name = f.agentName || f.agentId || '未知';
        const persp = f.perspective || '';
        const stance = f.stance || '';
        const content = (f.content || '').slice(0, 200);
        return `- ${name}(${persp},${stance}): ${content}`;
      })
      .join('\n');
    const oracleText = oracle
      ? (typeof oracle === 'string' ? oracle : JSON.stringify(oracle).slice(0, 300))
      : '（无）';

    const context = [
      `用户问题: ${question}`,
      `智囊发言:`,
      findingsText,
      `卦象/结论: ${oracleText}`,
    ].join('\n');

    // LLM 评估（5s 超时兜底）
    const llmRaw = await Promise.race([
      callLLM(
        [
          {
            role: 'system',
            content:
              '你是一个推演质量评估器。对以下推演结果按 4 项指标打分（每项 1-5 分整数）。只返回 JSON，格式: {"relevance":1-5,"diversity":1-5,"no_hallucination":1-5,"actionability":1-5}。指标说明: relevance=相关性(智囊发言是否与问题相关), diversity=多元性(是否覆盖多个视角), no_hallucination=无幻觉(是否有事实错误,5分=完全无错误), actionability=可操作性(建议是否具体可执行)。',
          },
          { role: 'user', content: context },
        ],
        { maxTokens: 200, temperature: 0.3, timeout: EVAL_TIMEOUT_MS },
      ),
      new Promise((resolve) => setTimeout(() => resolve(null), EVAL_TIMEOUT_MS)),
    ]);

    const scores = parseEvalScores(llmRaw);
    if (!scores) {
      logger.warn('[EvalPipeline] LLM 评估失败或超时，跳过写库', { sessionId });
      return null;
    }

    // 写入 session_eval 表
    const evalId = `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await query({
      table: 'session_eval',
      action: 'insert',
      data: {
        id: evalId,
        session_id: sessionId,
        user_id: session.user_id || null,
        relevance: scores.relevance,
        diversity: scores.diversity,
        no_hallucination: scores.no_hallucination,
        actionability: scores.actionability,
        raw: JSON.stringify({ llmRaw: llmRaw ? String(llmRaw).slice(0, 500) : null, ts: Date.now() }),
      },
    });

    logger.info('[EvalPipeline] 评估完成', { sessionId, evalId, scores });
    return { sessionId, evalId, ...scores };
  } catch (e) {
    // 失败不阻塞：调用方不 await，这里吞掉异常只记日志
    logger.warn('[EvalPipeline] 评估失败（不阻塞主流程）', { sessionId, error: e.message });
    return null;
  }
}

// ============ 工具函数 ============

/**
 * 从 LLM 返回中解析 4 项评分
 * 容错：提取首个 JSON 对象，校验每项为 1-5 整数
 * @param {string|null} raw
 * @returns {object|null} {relevance, diversity, no_hallucination, actionability}
 */
function parseEvalScores(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try {
    obj = JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
  const pick = (k) => {
    const v = Number(obj[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    return v;
  };
  const result = {};
  for (const k of EVAL_METRICS) {
    const v = pick(k);
    if (v == null) return null;
    result[k] = v;
  }
  return result;
}

// ============ 自检 ============

/**
 * 自检：解析逻辑 + 评估流程不抛错
 * 跑法: cd server && node --input-type=module -e "import('./src/services/evalPipeline.js').then(m=>m.selfTest())"
 */
export async function selfTest() {
  logger.info('=== EvalPipeline selfTest 开始 ===');

  // 1. parseEvalScores 正例
  const ok1 = parseEvalScores('{"relevance":4,"diversity":3,"no_hallucination":5,"actionability":2}');
  const pass1 = ok1 && ok1.relevance === 4 && ok1.diversity === 3 && ok1.no_hallucination === 5 && ok1.actionability === 2;
  logger.info('[selfTest] 1. parseEvalScores 正例', { ok1, pass1 });

  // 2. parseEvalScores 边界（越界 / 缺字段 / 非 JSON）
  const ok2a = parseEvalScores('{"relevance":0,"diversity":3,"no_hallucination":5,"actionability":2}'); // 0 非法
  const ok2b = parseEvalScores('{"relevance":4,"diversity":3}'); // 缺字段
  const ok2c = parseEvalScores('not json');
  const pass2 = ok2a === null && ok2b === null && ok2c === null;
  logger.info('[selfTest] 2. parseEvalScores 边界', { ok2a, ok2b, ok2c, pass2 });

  // 3. evaluateSession 不存在 session 不抛错
  const r3 = await evaluateSession('nonexistent_session_xxx');
  const pass3 = r3 === null;
  logger.info('[selfTest] 3. evaluateSession 不存在 session', { r3, pass3 });

  // 4. evaluateSession 空 sessionId 不抛错
  const r4 = await evaluateSession('');
  const pass4 = r4 === null;
  logger.info('[selfTest] 4. evaluateSession 空 sessionId', { r4, pass4 });

  const ok = pass1 && pass2 && pass3 && pass4;
  logger.info('=== EvalPipeline selfTest 结果 ===', { ok });
  if (!ok) {
    throw new Error(`EvalPipeline selfTest 失败: pass1=${pass1} pass2=${pass2} pass3=${pass3} pass4=${pass4}`);
  }
  return { ok };
}

export default { evaluateSession, selfTest };
