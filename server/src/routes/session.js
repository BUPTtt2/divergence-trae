import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireUser } from '../middleware/auth.js';
import { createSession, getSession, updateSession, addDialogue, getActiveSessions, getSessionHistory, completeSession } from '../services/sessionService.js';
import { analyzeQuestion } from '../services/agentEngine.js';
import { generateAgentDialogue, generateAgentQuestion, shouldContinueAsking, generateMasterSummary } from '../services/agentEngine.js';
import { AGENT_POOL_MAP } from '../data/agentPool.js';
import { callLLMStream } from '../services/llmRouter.js';
import { extractMemoriesFromInference } from '../services/memoryService.js';

const router = express.Router();

// 创建会话并分析问题
router.post('/', requireUser, asyncHandler(async (req, res) => {
  const { question } = req.body;
  const userId = req.userId;
  if (!question || !question.trim()) return res.status(400).json({ error: '问题不能为空' });
  if (question.length > 200) return res.status(400).json({ error: '问题不能超过200字' });

  const session = await createSession(userId, question.trim());

  // 分析问题，选择Agent
  const analyzeResult = await analyzeQuestion(question.trim(), userId);
  const agentIds = analyzeResult.agentIds || ['jingyuan'];

  const updated = await updateSession(session.id, {
    agentIds,
    analysis: analyzeResult.analysis || '',
    reasoning: analyzeResult.reasoning || '',
    phase: 'agent_debate',
    currentAgentIdx: 0,
  });

  res.json({
    session: updated,
    agents: agentIds.map(id => AGENT_POOL_MAP[id]).filter(Boolean),
    analysis: analyzeResult.analysis,
    reasoning: analyzeResult.reasoning,
  });
}));

// 获取会话
router.get('/:id', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });
  res.json({ session });
}));

// Agent 发言（流式 SSE）
router.get('/:id/dialogue', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const agentIdx = session.currentAgentIdx;
  const agentId = session.agentIds[agentIdx];
  const agent = AGENT_POOL_MAP[agentId];
  if (!agent) return res.status(400).json({ error: 'Agent不存在' });

  // 构建对话历史上下文
  const previousDialogues = [];
  for (let i = 0; i < agentIdx; i++) {
    const prevId = session.agentIds[i];
    const texts = session.dialogueHistory[prevId] || [];
    const lastText = texts.filter(t => t.speaker === 'agent').pop();
    if (lastText) previousDialogues.push({ agentId: prevId, name: AGENT_POOL_MAP[prevId]?.name, text: lastText.text });
  }

  // 当前Agent的对话历史（反问+用户回答）
  const currentAgentHistory = (session.dialogueHistory[agentId] || []).map(d => ({
    speaker: d.speaker,
    text: d.text,
    agentId,
  }));

  // 生成发言
  const systemPrompt = `${agent.persona}\n\n【回答要求】\n- 1-3句话，不超过80字\n- 用中文口语\n- 必须抓住用户问题里的具体词\n- 可以质疑、反问、泼冷水`;

  let contextText = '';
  if (previousDialogues.length > 0) {
    contextText += '\n\n【其他智囊的发言】\n' + previousDialogues.map(d => `${d.name}: ${d.text}`).join('\n');
  }
  if (currentAgentHistory.length > 0) {
    contextText += '\n\n【你与用户的对话历史】\n' + currentAgentHistory.map(d => `${d.speaker === 'agent' ? '你' : '用户'}: ${d.text}`).join('\n');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `用户问：「${session.question}」${contextText}\n\n请以 ${agent.name}（${agent.stance}）的身份，说1-3句话回应。` },
  ];

  // 流式输出
  const fullText = await callLLMStream(messages, { maxTokens: 200, temperature: 0.9 }, res);

  // 保存发言到会话
  if (fullText) {
    await addDialogue(session.id, agentId, 'agent', fullText);
  }
}));

// Agent 反问
router.post('/:id/ask', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const agentIdx = session.currentAgentIdx;
  const agentId = session.agentIds[agentIdx];
  const agent = AGENT_POOL_MAP[agentId];
  if (!agent) return res.status(400).json({ error: 'Agent不存在' });

  // 构建完整对话历史
  const dialogueHistory = [];
  for (let i = 0; i <= agentIdx; i++) {
    const id = session.agentIds[i];
    const texts = session.dialogueHistory[id] || [];
    texts.forEach(t => dialogueHistory.push({ speaker: t.speaker, text: t.text, agentId: id }));
  }

  const result = await generateAgentQuestion(agent, session.question, dialogueHistory);
  res.json(result);
}));

// 用户回答
router.post('/:id/answer', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const { answer } = req.body;
  if (!answer || !answer.trim()) return res.status(400).json({ error: '回答不能为空' });
  if (answer.length > 500) return res.status(400).json({ error: '回答不能超过500字' });

  const agentIdx = session.currentAgentIdx;
  const agentId = session.agentIds[agentIdx];

  // 保存用户回答
  await addDialogue(session.id, agentId, 'user', answer.trim());

  // 判断是否继续追问
  const dialogueHistory = [];
  for (let i = 0; i <= agentIdx; i++) {
    const id = session.agentIds[i];
    const texts = session.dialogueHistory[id] || [];
    texts.forEach(t => dialogueHistory.push({ speaker: t.speaker, text: t.text, agentId: id }));
  }

  const continueResult = await shouldContinueAsking(agent, session.question, dialogueHistory, answer.trim());
  res.json(continueResult);
}));

// 推进到下一个Agent
router.post('/:id/next', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const nextIdx = session.currentAgentIdx + 1;
  if (nextIdx >= session.agentIds.length) {
    // 所有Agent发言完毕
    await updateSession(session.id, { phase: 'summary', currentAgentIdx: -1 });
    res.json({ done: true, phase: 'summary' });
  } else {
    await updateSession(session.id, { currentAgentIdx: nextIdx });
    res.json({ done: false, currentAgentIdx: nextIdx });
  }
}));

// 生成总结
router.post('/:id/summary', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const summaryResult = await generateMasterSummary(session.question, session.agentIds, session.dialogueHistory);
  await updateSession(session.id, {
    summary: summaryResult.summary,
    options: summaryResult.options,
  });

  res.json(summaryResult);
}));

// 用户选择
router.post('/:id/choose', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const { choice } = req.body;
  await updateSession(session.id, { selectedChoice: choice, phase: 'committing' });
  res.json({ ok: true });
}));

// 用户写承诺
router.post('/:id/commit', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  const { commit } = req.body;
  await updateSession(session.id, { commitText: commit, phase: 'oracle_prompt' });
  res.json({ ok: true });
}));

// 完成会话
router.post('/:id/complete', requireUser, asyncHandler(async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  if (session.userId !== req.userId) return res.status(403).json({ error: '无权访问' });

  // 提取记忆
  try {
    await extractMemoriesFromInference(session.userId, {
      question: session.question,
      summary: session.summary,
      selectedChoice: session.selectedChoice,
      commitText: session.commitText,
      agentIds: session.agentIds,
    });
  } catch (e) {
    console.warn('[session] 记忆提取失败:', e.message);
  }

  // 增加经验值
  try {
    const { addXP } = await import('../services/levelService.js');
    await addXP(session.userId, 20, 'inference');
  } catch (e) {
    console.warn('[session] 经验值增加失败:', e.message);
  }

  await completeSession(req.params.id);
  res.json({ ok: true });
}));

// 获取活跃会话列表
router.get('/', requireUser, asyncHandler(async (req, res) => {
  const sessions = await getActiveSessions(req.userId);
  res.json({ sessions });
}));

export default router;
