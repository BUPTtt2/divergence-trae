import { Router } from 'express';
import { analyzeQuestion, generateAgentDialogue, generateAgentQuestion, shouldContinueAsking, generateMasterSummary } from '../services/agentEngine.js';
import { callLLMStream } from '../services/llmRouter.js';
import { AGENT_POOL, AGENT_POOL_MAP, buildAgentSystemPrompt } from '../data/agentPool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { llmRateLimit } from '../middleware/rateLimit.js';
import { optionalAuth } from '../middleware/auth.js';
import { listAdvisors, formatAdvisorForAgentPool } from '../services/customAdvisorService.js';

const router = Router();

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
    const { agentId, question, previousDialogues = [], agentConfig } = req.body;
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
    const systemPrompt = buildAgentSystemPrompt(agent);

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

    const userPrompt = `用户问：「${question}」${contextText}

请以 ${agent.name}（${agent.stance}）的身份，说 1-3 句话回应。不要复述用户问题。`;

    const fullText = await callLLMStream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
