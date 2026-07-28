import { Router } from 'express';
import { analyzeQuestion, generateAgentDialogue, generateAgentQuestion, shouldContinueAsking, generateMasterSummary } from '../services/agentEngine.js';
import { callLLMStream, callLLMWithTools } from '../services/llmRouter.js';
import { AGENT_POOL, AGENT_POOL_MAP, buildAgentSystemPrompt } from '../data/agentPool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { llmRateLimit } from '../middleware/rateLimit.js';
import { optionalAuth } from '../middleware/auth.js';
import { listAdvisors, formatAdvisorForAgentPool } from '../services/customAdvisorService.js';
import { getToolSchemas, executeTool, summarizeToolResult } from '../services/mcpService.js';

const router = Router();

/**
 * 智囊 × 工具映射（按智囊视角注入对应工具子集）
 * 心禾/镜渊/兑言/养生/师道/震行 不注入工具（重感受/反思/沟通/行动）
 */
const AGENT_TOOL_MAP = {
  qiangu: ['stock_query', 'exchange_rate', 'salary_calc'],
  fengyan: ['web_search', 'company_info'],
  luxiang: ['web_search'],
  yuntu: ['macro_data', 'web_search'],
  falv: ['web_search'],
  jishu: ['web_search'],
};

/**
 * 按智囊选择工具 schema（≤3 个）
 */
function selectToolsForAgent(agent) {
  const ids = AGENT_TOOL_MAP[agent.id] || [];
  return getToolSchemas(ids);
}

/**
 * 设置 SSE headers
 */
function setupSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/**
 * 模拟流式推送（把已生成的文本逐字推给前端）
 */
async function streamPrecomputedText(res, text, delay = 15) {
  for (const char of text) {
    res.write(`data: ${JSON.stringify({ content: char })}\n\n`);
    await new Promise(r => setTimeout(r, delay));
  }
  res.write(`event: done\ndata: ${JSON.stringify({ full: text })}\n\n`);
  res.end();
}

// GET /api/agent/personas — 返回全部智囊的完整 persona 数据（单一来源）
// 前端通过此接口获取 persona，不再本地维护一份
router.get(
  '/personas',
  asyncHandler(async (req, res) => {
    const personas = AGENT_POOL.map(a => ({
      id: a.id,
      name: a.name,
      stance: a.stance,
      color: a.color,
      glow: a.glow,
      symbol: a.symbol,
      questionTypes: a.questionTypes,
      identity: a.identity,
      methodology: a.methodology,
      deliverable: a.deliverable,
      persona: a.persona,
      seed: a.stance, // 向后兼容前端 seed 字段
    }));
    res.json({ personas });
  })
);

router.post(
  '/analyze',
  optionalAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { question, useCustomAdvisors, customAdvisorIds } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '缺少 question 参数' });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }

    const result = await analyzeQuestion(question, req.userId, {
      useCustomAdvisors: useCustomAdvisors || false,
      customAdvisorIds: customAdvisorIds || [],
    });

    const customAgents = [];
    if (useCustomAdvisors && req.userId) {
      try {
        const userAdvisors = await listAdvisors(req.userId);
        const filtered = customAdvisorIds && customAdvisorIds.length > 0
          ? userAdvisors.filter(a => customAdvisorIds.includes(a.id))
          : userAdvisors;
        for (const advisor of filtered) {
          customAgents.push(formatAdvisorForAgentPool(advisor));
        }
      } catch (e) {
        console.warn('[agent] 加载自定义顾问失败:', e.message);
      }
    }

    const allAgentMap = { ...AGENT_POOL_MAP };
    for (const ca of customAgents) {
      allAgentMap[ca.id] = ca;
    }

    const agents = result.agentIds
      .map((id) => allAgentMap[id])
      .filter(Boolean)
      .map((a) => ({
        id: a.id,
        name: a.name,
        stance: a.stance,
        color: a.color || '#6b7280',
        glow: a.glow || 'rgba(107, 114, 128, 0.3)',
        symbol: a.symbol || '◉',
        isCustom: a.isCustom || false,
      }));

    res.json({
      question,
      agentIds: result.agentIds,
      agents,
      reasoning: result.reasoning,
      analysis: result.analysis || '',
      fallback: result.fallback || false,
    });
  })
);

router.post(
  '/dialogue',
  optionalAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { agentId, question, previousDialogues = [], agentConfig, pendingMentions, availableAgents } = req.body;
    const userId = req.userId;

    if (!agentId || !question) {
      return res.status(400).json({ error: '缺少 agentId 或 question 参数' });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }

    let agent = AGENT_POOL_MAP[agentId];

    if (!agent && agentId.startsWith('custom_') && userId) {
      try {
        const advisorId = agentId.replace('custom_', '');
        const { getAdvisor } = await import('../services/customAdvisorService.js');
        const advisor = await getAdvisor(advisorId, userId);
        if (advisor) {
          agent = formatAdvisorForAgentPool(advisor);
        }
      } catch (e) {
        console.warn('[agent] 加载自定义顾问失败:', e.message);
      }
    }

    // 如果从数据库加载失败，检查请求体中是否有 agentConfig
    if (!agent && agentConfig && typeof agentConfig === 'object') {
      agent = {
        id: agentId,
        name: agentConfig.name || '自定义顾问',
        stance: agentConfig.stance || agentConfig.perspective || '旁观者',
        persona: agentConfig.persona || `你是一位${agentConfig.stance || '中立'}视角的顾问。`,
        color: agentConfig.color || '#6b7280',
        glow: agentConfig.glow || 'rgba(107, 114, 128, 0.3)',
        symbol: agentConfig.icon || '◉',
        isCustom: true,
      };
    }

    if (!agent) {
      return res.status(404).json({ error: `Agent ${agentId} 不存在` });
    }

    // 使用 buildAgentSystemPrompt 组装三层提示词（identity/methodology/deliverable）
    // 三层结构的 deliverable 已包含交付标准（≤80字/口语/抓具体词等），无需重复
    // 组装参与智囊列表（供 systemPrompt 的 <team_map>/<available_agents> 用，让 LLM 知道可以 @ 谁）
    let teamAgents = [];
    if (Array.isArray(availableAgents) && availableAgents.length > 0) {
      teamAgents = availableAgents.map(a => {
        const id = a.id || a.agentId;
        const poolAgent = AGENT_POOL_MAP[id];
        return { id, name: a.name || poolAgent?.name || id, stance: a.stance || poolAgent?.stance || '智囊' };
      });
    } else if (Array.isArray(previousDialogues) && previousDialogues.length > 0) {
      const seen = new Set();
      for (const d of previousDialogues) {
        const id = d.agentId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const poolAgent = AGENT_POOL_MAP[id];
        teamAgents.push({ id, name: d.name || poolAgent?.name || id, stance: poolAgent?.stance || '智囊' });
      }
    }
    if (!teamAgents.some(a => a.id === agentId)) {
      teamAgents.push({ id: agentId, name: agent.name, stance: agent.stance });
    }
    const systemPrompt = buildAgentSystemPrompt(agent, teamAgents);

    let contextText = '';
    if (Array.isArray(previousDialogues) && previousDialogues.length > 0) {
      contextText = '\n\n【其他智囊的发言（供参考，不要重复）】\n' +
        previousDialogues
          .map((d) => {
            const name = d.name || AGENT_POOL_MAP[d.agentId]?.name || d.agentId || '未知';
            return `${name}: ${d.text}`;
          })
          .join('\n');
    }

    // 待回应 mention 注入（来自上一轮其他智囊对本 Agent 的 @，需在 userPrompt 最前面提示）
    const MENTION_TYPE_ZH = { rebuttal: '反驳', support: '补充', question: '追问' };
    let mentionPrefix = '';
    if (Array.isArray(pendingMentions) && pendingMentions.length > 0) {
      const myMentions = pendingMentions.filter(m => m && m.to === agentId);
      if (myMentions.length > 0) {
        const blocks = myMentions.map(m => {
          const typeZh = MENTION_TYPE_ZH[m.type] || '追问';
          const fromName = m.fromName || AGENT_POOL_MAP[m.from]?.name || m.from || '某智囊';
          const snippet = m.snippet || '';
          const q = m.question || '';
          return `【待回应】${fromName} @ 你（${typeZh}）：${snippet}\n${q}`;
        });
        mentionPrefix = blocks.join('\n') + '\n请先回应上述 @，再发表你的观点。\n\n';
      }
    }

    // ===== 工具调用流程（方案 A：原生 function calling）=====
    // 1. 按智囊选择工具子集（在 userPrompt 组装前，以便注入工具提示）
    const toolSchemas = selectToolsForAgent(agent);

    // Step 5: 有工具时注入 <tool_protocol> 协议段（指导 LLM 工具调用行为 + 失败降级）
    let finalSystemPrompt = systemPrompt;
    if (toolSchemas.length > 0) {
      const toolNames = toolSchemas.map(t => t.function?.name).filter(Boolean).join('、');
      finalSystemPrompt += `\n\n<tool_protocol>\n【工具调用协议】你被授权使用以下工具获取实时数据：${toolNames}\n\n调用原则：\n- 仅当问题涉及实时数据（股价/汇率/天气/公司信息/宏观数据等）时才调用工具\n- 一次发言最多调用 1 个工具，避免拖慢响应\n- 工具返回的数据必须自然融入发言，标注来源（如"据新浪财经"）\n- 若工具调用失败或返回错误，基于你的专业经验直接发言，不要提及"工具失败"或"数据获取异常"\n- 不允许编造未通过工具获取的具体数字\n</tool_protocol>`;
    }

    const userPrompt = `${mentionPrefix}用户问：「${question}」${contextText}

请以 ${agent.name}（${agent.stance}）的身份，说 1-3 句话回应。不要复述用户问题。${toolSchemas.length > 0 ? '\n\n【工具提示】若有可用工具且问题涉及实时数据（股价/汇率/天气/公司信息等），请优先调用工具获取真实数据后再发言；工具返回的数据请自然融入回答并标注来源。' : ''}`;

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let toolCallTriggered = false;

    if (toolSchemas.length > 0) {
      try {
        const t0 = Date.now();
        // 2. 第一次调 LLM（带 tools，非流式，10s 超时）
        //    用低 temperature（0.3）让 LLM 更倾向于遵循指令调用工具；
        //    最终发言流式调用仍用 0.9 保持人设创造力。
        const toolResult = await callLLMWithTools({
          messages,
          tools: toolSchemas,
          maxTokens: 200,
          temperature: 0.3,
          timeout: 10000,
        });
        console.log(`[agent][tools] ${agentId} 首轮 ${Date.now() - t0}ms, tool_calls=${!!toolResult.tool_calls}`);

        // 3. 若 LLM 返回 tool_calls：执行工具，把结果喂回 LLM 流式生成最终发言
        if (toolResult.tool_calls && toolResult.tool_calls.length > 0 && !res.headersSent) {
          toolCallTriggered = true;
          setupSSEHeaders(res);
          res.write(`event: start\ndata: ${JSON.stringify({ ok: true, tools: toolResult.tool_calls.map(t => t.function?.name) })}\n\n`);

          // 组装多轮消息：原 messages + assistant(tool_calls) + 每个 tool 结果
          const finalMessages = [
            ...messages,
            {
              role: 'assistant',
              content: toolResult.content || '',
              tool_calls: toolResult.tool_calls,
            },
          ];

          // 顺序执行每个工具调用（总时长 ≤10s，每个工具 5s 超时）
          for (const tc of toolResult.tool_calls) {
            const tName = tc.function?.name || '';
            let tArgs = {};
            try { tArgs = JSON.parse(tc.function?.arguments || '{}'); } catch {}

            res.write(`event: tool_call\ndata: ${JSON.stringify({ tool: tName, params: tArgs, status: 'running' })}\n\n`);

            let execResult;
            try {
              execResult = await executeTool(tName, tArgs);
            } catch (e) {
              console.warn(`[agent][tools] ${agentId} 工具 ${tName} 执行失败:`, e.message);
              execResult = { error: e.message };
            }

            const summary = summarizeToolResult(tName, execResult);
            const toolFailed = !!execResult?.error;
            res.write(`event: tool_result\ndata: ${JSON.stringify({ tool: tName, summary, status: toolFailed ? 'failed' : 'ok' })}\n\n`);

            // Step 5: role:tool 内容 — 工具失败时喂明确降级指令，成功时喂结果摘要
            // 限制长度防 token 爆炸（≤800 字符 ≈ 200 token）
            const toolContent = toolFailed
              ? `工具 ${tName} 执行失败：${execResult.error}。请基于你的专业经验直接发言，不要提及工具调用失败，不要编造具体数字。`
              : JSON.stringify(execResult).slice(0, 800);
            finalMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: toolContent,
            });
          }

          // 4. 第二轮流式生成最终发言（带工具结果上下文）
          const finalText = await callLLMStream(finalMessages, {
            maxTokens: 200,
            temperature: 0.9,
            alreadyStreaming: true,
          }, res);

          if (finalText === null && !res.writableEnded) {
            // 工具流程下降级：直接基于经验生成
            const fallbackText = await generateAgentDialogue(agent, question, previousDialogues);
            res.write(`event: fallback\ndata: ${JSON.stringify({ text: fallbackText, reason: 'final_stream_failed' })}\n\n`);
            res.write(`event: done\ndata: ${JSON.stringify({ full: fallbackText, fallback: true })}\n\n`);
            res.end();
          }
          return;
        }

        // 5. LLM 未返回 tool_calls 但返回了 content：直接流式推送已有内容
        if (toolResult.content && !res.headersSent) {
          setupSSEHeaders(res);
          res.write(`event: start\ndata: ${JSON.stringify({ ok: true, tools: [] })}\n\n`);
          await streamPrecomputedText(res, toolResult.content);
          console.log(`[agent][tools] ${agentId} 首轮直接返回（无工具调用）`);
          return;
        }

        // 无 content 无 tool_calls：降级到无工具流式
        if (!res.headersSent) {
          console.warn(`[agent][tools] ${agentId} 首轮无内容无 tool_calls，降级流式`);
        } else {
          // headers 已发送但没内容，降级走不下去，直接 fallback
          const fallbackText = await generateAgentDialogue(agent, question, previousDialogues);
          await streamPrecomputedText(res, fallbackText);
          return;
        }
      } catch (e) {
        console.warn(`[agent][tools] ${agentId} 工具调用流程异常，降级为无工具:`, e.message);
        // 降级：继续走下面的无工具流式
      }
    }

    // ===== 默认流程：无工具流式（或工具降级）=====
    if (toolCallTriggered) return; // 上面已处理

    const fullText = await callLLMStream(
      messages,
      { maxTokens: 200, temperature: 0.9 },
      res
    );

    if (fullText === null && !res.headersSent) {
      const fallbackText = await generateAgentDialogue(agent, question, previousDialogues);
      res.json({
        agentId,
        agentName: agent.name,
        text: fallbackText,
        fallback: true,
      });
    }
  })
);

router.post(
  '/ask',
  optionalAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { agentId, question, dialogueHistory = [] } = req.body;

    if (!agentId || !question) {
      return res.status(400).json({ error: '缺少 agentId 或 question 参数' });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }

    const agent = AGENT_POOL_MAP[agentId];
    if (!agent) {
      return res.status(404).json({ error: `Agent ${agentId} 不存在` });
    }

    const result = await generateAgentQuestion(agent, question, dialogueHistory);

    res.json({
      agentId,
      agentName: agent.name,
      question: result.question,
      needMoreInfo: result.needMoreInfo,
    });
  })
);

router.post(
  '/continue-ask',
  optionalAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { agentId, originalQuestion, dialogueHistory = [], lastUserAnswer = '' } = req.body;

    if (!agentId || !originalQuestion) {
      return res.status(400).json({ error: '缺少 agentId 或 originalQuestion 参数' });
    }
    if (originalQuestion.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }

    const agent = AGENT_POOL_MAP[agentId];
    if (!agent) {
      return res.status(404).json({ error: `Agent ${agentId} 不存在` });
    }

    const result = await shouldContinueAsking(agent, originalQuestion, dialogueHistory, lastUserAnswer);

    res.json({
      agentId,
      agentName: agent.name,
      continueAsking: result.continueAsking,
      nextQuestion: result.nextQuestion || '',
    });
  })
);

router.post(
  '/summary',
  optionalAuth,
  llmRateLimit,
  asyncHandler(async (req, res) => {
    const { originalQuestion, agentIds = [], dialogueHistory = {} } = req.body;

    if (!originalQuestion) {
      return res.status(400).json({ error: '缺少 originalQuestion 参数' });
    }
    if (originalQuestion.length > 500) {
      return res.status(400).json({ error: '问题过长，请控制在500字以内' });
    }

    const result = await generateMasterSummary(originalQuestion, agentIds, dialogueHistory);

    res.json({
      summary: result.summary,
      options: result.options,
    });
  })
);

export default router;
