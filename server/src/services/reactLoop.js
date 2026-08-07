/**
 * ReAct Loop — 演的 Think→Act→Observe 循环执行器（v3.0）
 *
 * 替代 deliberationEngine.execute 的一次性智囊发言，实现真正的 ReAct：
 * 演每轮 Think 输出结构化 JSON action，自主决定下一步：
 *   - tool_call:    调工具（web_search/weather_query/...）
 *   - advisor_call: 调智囊（可指定多位，并行）
 *   - ask_user:     追问用户（信息不足时）
 *   - self_critique: 演自评，发现盲区
 *   - output:       认为可定卦，进入 REFLECT
 *
 * 设计判断：不用 function calling，演在 content 里输出 JSON action。
 * 原因：魔搭等 provider 可能不支持 function calling，JSON action 更通用。
 *
 * 成本控制：全局 LLM 调用预算 12 次/推演，超限强制 output。
 * 超时：DELIBERATE 阶段 90s。
 *
 * 设计依据: docs/specs/2026-08-01-industrial-v3-design.md 第6节
 */

import { callLLM } from './llmRouter.js';
import { executeEvidenceTool, getAgentToolRegistry } from './toolEvidenceGateway.js';
import { generateAgentDialogue } from './agentEngine.js';
import { AGENT_POOL } from '../data/agentPool.js';
import { withRetry, withTimeout } from './retryHelper.js';
import { classifyLLMError } from './errorTypes.js';
import logger from './logger.js';
import eventBus from './eventBus.js';
import { appendEvent } from './eventStore.js';
import * as memoryService from './memoryService.js';

const MAX_ROUNDS = 4;
const MAX_LLM_CALLS = 12;
const DELIBERATE_TIMEOUT_MS = 120000;
const TOOL_TIMEOUT_MS = 25000;
const ADVISOR_TIMEOUT_MS = 35000;
const BLACKBOARD_MAX_CHARS = 8000;
const TOOL_RESULT_MAX_CHARS = 2000;
const AGENT_TOOL_REGISTRY = getAgentToolRegistry();

/**
 * 构建演的 ReAct 系统提示
 * @param {object} state 推演状态
 * @param {number} round 当前轮次
 * @param {object} cachedMemories 缓存的记忆 {profile, related}
 */
function buildReActSystemPrompt(state, round, cachedMemories) {
  const availableTools = Object.values(AGENT_TOOL_REGISTRY)
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
  const availableAgents = (state.advisorPool || AGENT_POOL.slice(0, 6))
    .map((a) => `- ${a.id}（${a.name}，${a.stance || a.perspective || ''}）`)
    .join('\n');

  // ===== P6：注入用户画像和相关记忆（演的 ReAct Think 阶段也能看到）=====
  let memoryInjection = '';
  if (cachedMemories) {
    if (cachedMemories.profile && String(cachedMemories.profile).trim()) {
      memoryInjection += `\n【用户画像背景（长期记忆汇总）】\n${String(cachedMemories.profile).trim()}\n`;
    }
    if (Array.isArray(cachedMemories.related) && cachedMemories.related.length > 0) {
      memoryInjection += `\n【相关历史推演记忆（仅供参考，不要直接复述）】\n`;
      cachedMemories.related.forEach((m, i) => {
        memoryInjection += `${i + 1}. [${m.memory_type || '记忆'}] ${m.content}\n`;
      });
    }
  }

  return `你是"演"，赛博推演师。正在 DELIBERATE 阶段，通过 ReAct 循环推演用户的问题。
${memoryInjection}
【用户问题】
${state.questionContext || state.question}

【已有推演维度】
${(state.plan?.dimensions || []).map((d) => `- ${d.name}（${d.perspective}）`).join('\n') || '（无）'}

【可用工具】
${availableTools}

【可用智囊】
${availableAgents}

【当前轮次】第 ${round}/${MAX_ROUNDS} 轮，剩余 LLM 预算 ${MAX_LLM_CALLS - (state.llmCallCount || 0)} 次

【你的任务】
分析当前推演状态，决定下一步行动。必须输出严格 JSON（不要 markdown 代码块，不要多余文字）：
{
  "action": "tool_call|advisor_call|ask_user|self_critique|output",
  "args": { ... },
  "reason": "一句话说明为什么这一步"
}

【action 类型说明】
- tool_call: 调工具获取实时信息。args: {"tool": "工具名", "params": {...}}
- advisor_call: 召唤智囊发言。args: {"agentIds": ["智囊ID1", "智囊ID2"]}
- ask_user: 信息严重不足，需追问。args: {"questions": [{"question":"问题", "reason":"为什么问"}]}
- self_critique: 自我批判，发现盲区。args: {"critique": "发现的问题"}
- output: 信息充分，可以立卦。args: {}

【判断准则】
- 如果黑板中已有工具观测结果，不要重复调相同工具！直接基于已有信息推理
- 优先 advisor_call 让智囊从不同维度发言（至少2位）
- 只有当黑板中确实缺少关键事实且无法从问题本身推断时，才 tool_call
- 若用户问题模糊到无法推演，ask_user（但不要问用户已提及的信息）
- 若发现前面推理有盲区，self_critique
- 信息充分后 output 进入立卦
- 不要在同一轮重复调相同工具/智囊
- 你是「演」，有自己独立思考能力，不要过度依赖工具，多用你自己的判断力`;
}

/**
 * 构建黑板上下文（演能看到的历史推演过程）
 * 限制总量 8KB，超限则摘要压缩
 */
function buildBlackboard(state) {
  const parts = [];

  // 工具结果
  if (state.toolResults && state.toolResults.length > 0) {
    const toolText = state.toolResults
      .map((r) => {
        const evidenceLabel = r.evidence
          ? `${r.evidence.level}/${r.evidence.freshness}/${r.evidence.sourceName}`
          : `未采信/${r.status || 'unknown'}`;
        return `[工具${r.tool} · ${evidenceLabel}] ${r.summary || JSON.stringify(r.result || {}).slice(0, 200)}`;
      })
      .join('\n');
    parts.push(`【工具观测】\n${toolText}`);
  }

  // 智囊发言
  if (state.findings && state.findings.length > 0) {
    const findingsText = state.findings
      .map((f) => `[${f.agentName || f.agentId}] ${f.content}`)
      .join('\n');
    parts.push(`【智囊发言】\n${findingsText}`);
  }

  // 推演历史
  if (state.dialogue && state.dialogue.length > 0) {
    const dialogueText = state.dialogue
      .map((d) => `[${d.role} R${d.round}] ${d.content || d.action || ''}`)
      .join('\n');
    parts.push(`【推演轨迹】\n${dialogueText}`);
  }

  let blackboard = parts.join('\n\n');
  // 总量限制 8KB
  if (blackboard.length > BLACKBOARD_MAX_CHARS) {
    blackboard = blackboard.slice(0, BLACKBOARD_MAX_CHARS) + '\n...（黑板已截断，早期信息已压缩）';
  }
  return blackboard || '（黑板为空，这是第一轮推演）';
}

/**
 * 解析演的 Think 输出为 action 对象
 */
function parseThinkAction(text) {
  if (!text) return { type: 'output', args: {}, reason: '演未输出，默认进入立卦' };

  // 尝试直接解析 JSON
  try {
    const parsed = JSON.parse(text);
    if (parsed.action) {
      return { type: parsed.action, args: parsed.args || {}, reason: parsed.reason || '' };
    }
  } catch {
    // 不是纯 JSON，尝试提取 JSON 块
  }

  // 尝试提取 {...} 块
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed.action) {
        return { type: parsed.action, args: parsed.args || {}, reason: parsed.reason || '' };
      }
    } catch {
      // 解析失败
    }
  }

  // 解析失败：返回 output（让流程继续，不卡死）
  logger.warn('[ReAct] Think 输出解析失败，默认 output', { text: text.slice(0, 200) });
  return { type: 'output', args: {}, reason: 'Think 输出格式错误，进入立卦' };
}

/**
 * 执行 ReAct 循环
 * @param {string} sessionId
 * @param {object} state 推演状态（可变，会追加 findings/toolResults/dialogue）
 * @returns {Promise<object>} { state: 'REFLECT'|'CLARIFY', askUser?: [...] }
 */
export async function runReActLoop(sessionId, state) {
  const startTime = Date.now();
  state.llmCallCount = state.llmCallCount || 0;

  // ===== P6：ReAct 循环开始前预加载记忆（一次加载，全程复用，避免重复查库）=====
  let cachedMemories = { profile: '', related: [] };
  if (state.userId) {
    try {
      const [profileMem, relatedMem] = await Promise.all([
        memoryService.getUserProfile?.(state.userId).catch(() => ''),
        memoryService.retrieveMemories?.(state.userId, state.questionContext || state.question, 4).catch(() => []),
      ]);
      cachedMemories = {
        profile: profileMem || '',
        related: Array.isArray(relatedMem) ? relatedMem : [],
      };
      logger.info('[ReAct] 记忆预加载完成', {
        sessionId,
        hasProfile: !!cachedMemories.profile,
        relatedCount: cachedMemories.related.length,
      });
    } catch (e) {
      logger.warn('[ReAct] 记忆预加载失败，跳过注入', { sessionId, error: e.message });
    }
  }

  logger.info('[ReAct] 循环开始', { sessionId, round: 1 });

  // ===== 避免日志反复：连续相同工具调用/空观察结果 → 强制终止搜索（避免 web_search 无限循环）
  let lastToolSig = '';
  let consecutiveSameTool = 0;
  let consecutiveEmptyObs = 0;
  const isToolCallAction = (a) => a && a.type === 'tool_call';
  const toolSignature = (args) => {
    try {
      return `${args?.tool || 'unknown'}:${JSON.stringify(args?.params || {}).slice(0, 160)}`;
    } catch (_) { return String(args?.tool); }
  };
  const observationIsEmptyish = (obs) => {
    if (!obs) return true;
    const t = String(obs).trim();
    if (t.length < 16) return true;
    // 只包含"找到 N 条/结果为 []/行动失败：AbortError/TIMEOUT"视为无实质内容
    if (/找到\s*\d+\s*条/.test(t) && t.length < 40) return true;
    if (/^(行动失败|工具.*不存在|未指定有效智囊)/.test(t) && t.length < 60) return true;
    return false;
  };

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // 超时检查
    if (Date.now() - startTime > DELIBERATE_TIMEOUT_MS) {
      logger.warn('[ReAct] DELIBERATE 超时，强制 output', { sessionId, round, elapsed: Date.now() - startTime });
      break;
    }

    // LLM 预算检查
    if (state.llmCallCount >= MAX_LLM_CALLS) {
      logger.warn('[ReAct] LLM 预算耗尽，强制 output', { sessionId, round, llmCalls: state.llmCallCount });
      break;
    }

    // === Think ===
    const systemPrompt = buildReActSystemPrompt(state, round, cachedMemories);
    const blackboard = buildBlackboard(state);

    let thinkText;
    try {
      thinkText = await withRetry(
        () => withTimeout(
          () => callLLM(
            [{ role: 'system', content: systemPrompt }, { role: 'user', content: blackboard }],
            { maxTokens: 300, temperature: 0.4 }
          ),
          25000,
          'ReAct Think'
        ),
        { retries: 2, delayMs: 1200, name: 'react_think' }
      );
    } catch (err) {
      logger.error('[ReAct] Think 失败', { sessionId, round, error: err.message });
      const errType = classifyLLMError(err);
      eventBus.emit(sessionId, { type: 'ERROR', data: { error: `演思考失败: ${err.message}`, type: errType } });
      // Think 失败不预设，直接进入 REFLECT（用已有 findings）
      break;
    }
    state.llmCallCount++;

    const action = parseThinkAction(thinkText);

    // 记录 Think 事件
    await appendEvent(sessionId, 'REACT_THINK', { thought: action.reason, round }, 'yan');
    eventBus.emit(sessionId, { type: 'THOUGHT', data: { step: `react_think_r${round}`, thought: action.reason, action: action.type, round } });

    logger.info('[ReAct] Think 完成', { sessionId, round, action: action.type, reason: action.reason });

    // output 或预算耗尽：进入 REFLECT
    if (action.type === 'output') {
      logger.info('[ReAct] 演决定 output，进入 REFLECT', { sessionId, round });
      break;
    }

    // === Act ===
    await appendEvent(sessionId, 'REACT_ACT', { action: action.type, args: action.args, round }, 'yan');
    eventBus.emit(sessionId, { type: 'ACTION', data: { tool: action.type, args: action.args, round } });

    let observation = '';

    try {
      switch (action.type) {
        case 'tool_call': {
          const { tool, params } = action.args;
          if (!AGENT_TOOL_REGISTRY[tool]) {
            observation = `工具 ${tool} 不存在`;
            break;
          }
          // ===== P0 相同工具冷却：若与上一轮工具+参数一致 → 连续计数，≥2 停止循环（避免 web_search 死循环）
          const sig = toolSignature(action.args);
          if (sig === lastToolSig && isToolCallAction(action)) {
            consecutiveSameTool++;
            if (consecutiveSameTool >= 2) {
              observation = `连续相同工具调用(${consecutiveSameTool}次)，停止搜索，转入总结`;
              logger.warn('[ReAct] 连续相同工具调用 强制output', { sessionId, round, sig });
              // 先写入 observation，再下一轮被 break → 改为：直接 set action.type = 'output' 让下一个 if 跳出去
              action.type = 'output';
              action.reason = action.reason || '工具无新结果，结束搜索';
            }
          } else {
            lastToolSig = sig;
            consecutiveSameTool = 1;
          }
          if (action.type === 'output') break;
          const gatewayResult = await withTimeout(
            () => executeEvidenceTool(tool, params || {}, {
              sessionId,
              actorId: state.userId || 'yan',
              allowedTools: Object.keys(AGENT_TOOL_REGISTRY),
            }),
            TOOL_TIMEOUT_MS,
            `工具${tool}`
          );
          observation = (
            gatewayResult.evidence?.summary
            || `工具证据未被接受：${gatewayResult.error?.code || gatewayResult.status}`
          ).slice(0, TOOL_RESULT_MAX_CHARS);
          if (!state.toolResults) state.toolResults = [];
          state.toolResults.push({
            tool,
            result: gatewayResult.evidence?.data || null,
            evidence: gatewayResult.evidence || null,
            status: gatewayResult.status,
            ok: gatewayResult.ok,
            summary: observation,
            error: gatewayResult.error || null,
          });
          break;
        }

        case 'advisor_call': {
          const agentIds = action.args.agentIds || [];
          const pool = state.advisorPool || AGENT_POOL;
          const agents = agentIds
            .map((id) => pool.find((a) => a.id === id))
            .filter(Boolean);
          if (agents.length === 0) {
            observation = '未指定有效智囊';
            break;
          }

          // 并行调智囊（batch=3），失败抛错不预设
          const BATCH = 3;
          for (let i = 0; i < agents.length; i += BATCH) {
            const batch = agents.slice(i, i + BATCH);
            const results = await Promise.allSettled(
              batch.map(async (agent) => {
                const text = await withRetry(
                  () => withTimeout(
                    () => generateAgentDialogue(
                      agent,
                      state.questionContext || state.question,
                      state.findings || [],
                      [],
                      state.userId
                    ),
                    ADVISOR_TIMEOUT_MS,
                    `智囊${agent.name}发言`
                  ),
                  { retries: 1, delayMs: 1000, name: `agent_${agent.id}` }
                );
                state.llmCallCount++;

                const content = (text || '').slice(0, 300);
                const finding = {
                  agentId: agent.id,
                  agentName: agent.name,
                  content,
                  stance: agent.stance || '',
                  perspective: agent.perspective || '',
                };

                if (!state.findings) state.findings = [];
                state.findings.push(finding);

                // 记录事件 + 推送 SSE
                await appendEvent(sessionId, 'ADVISOR_SPEAK', {
                  agentId: agent.id,
                  agentName: agent.name,
                  content,
                  stance: agent.stance,
                  perspective: agent.perspective,
                }, agent.id);
                eventBus.emit(sessionId, {
                  type: 'ADVISOR_SPEAK',
                  data: { agentId: agent.id, agentName: agent.name, content, stance: agent.stance || '' },
                });

                return content;
              })
            );
            // 如果整批都失败，记录但不预设（继续下一批或下一轮）
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length === batch.length && batch.length > 0) {
              logger.error('[ReAct] 智囊批次全失败', { sessionId, round, agents: batch.map((a) => a.id) });
              eventBus.emit(sessionId, {
                type: 'ERROR',
                data: { error: `智囊发言失败: ${failed[0].reason?.message || '未知'}` },
              });
            }
          }
          observation = `${agents.length}位智囊已发言`;
          break;
        }

        case 'ask_user': {
          const questions = action.args.questions || [];
          await appendEvent(sessionId, 'CLARIFY_ASKED', { questions }, 'yan');
          eventBus.emit(sessionId, { type: 'STATE_CHANGE', data: { from: 'DELIBERATE', to: 'CLARIFY', thought: '演·追问' } });
          logger.info('[ReAct] 演决定追问', { sessionId, round, questionCount: questions.length });
          return { state: 'CLARIFY', askUser: questions };
        }

        case 'self_critique': {
          observation = `演自评：${action.args.critique || '（无具体内容）'}`;
          break;
        }

        default:
          observation = `未知 action: ${action.type}`;
      }
    } catch (err) {
      logger.error('[ReAct] Act 失败', { sessionId, round, action: action.type, error: err.message });
      observation = `行动失败：${err.message}`;
    }

    // ===== P0 空观察结果连续 2 次 → 强制停止搜索（避免降级后反复空跑、日志刷屏）
    if (observationIsEmptyish(observation)) {
      consecutiveEmptyObs++;
      if (consecutiveEmptyObs >= 2 && action.type !== 'output') {
        logger.warn('[ReAct] 连续空观察结果 强制output', { sessionId, round, observation: String(observation).slice(0, 80) });
        action.type = 'output';
        action.reason = action.reason || '连续工具/智囊调用无实质信息，直接总结';
      }
    } else {
      consecutiveEmptyObs = 0;
    }
    // 若当前轮已强制 output → 写入 observation 后跳出 for（避免再跑下一轮）
    if (action.type === 'output') {
      await appendEvent(sessionId, 'REACT_OBSERVE', { observation, round }, 'yan');
      eventBus.emit(sessionId, { type: 'OBSERVATION', data: { summary: observation, round, earlyBreak: true } });
      if (!state.dialogue) state.dialogue = [];
      state.dialogue.push({ role: 'observe', content: observation, round });
      break;
    }

    // === Observe ===
    await appendEvent(sessionId, 'REACT_OBSERVE', { observation, round }, 'yan');
    eventBus.emit(sessionId, { type: 'OBSERVATION', data: { summary: observation, round } });

    if (!state.dialogue) state.dialogue = [];
    state.dialogue.push({ role: 'observe', content: observation, round });
  }

  logger.info('[ReAct] 循环结束，进入 REFLECT', {
    sessionId,
    rounds: MAX_ROUNDS,
    llmCalls: state.llmCallCount,
    findings: state.findings?.length || 0,
    toolResults: state.toolResults?.length || 0,
    elapsed: Date.now() - startTime,
  });

  return { state: 'REFLECT' };
}

export default { runReActLoop };
