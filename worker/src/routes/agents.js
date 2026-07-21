/**
 * 智囊路由（全部需要 authMiddleware）
 *
 * - POST /analyze   分析问题，匹配智囊
 * - POST /dialogue  单个智囊发言
 * - POST /summary   演的总结
 * - POST /feedback  智囊反馈
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, safeJsonParse, safeJsonStringify } from '../utils/id.js';
import {
  analyzeQuestion,
  generateAgentDialogue,
  generateSummary,
} from '../services/agentEngine.js';
import { getAgentById, AGENTS } from '../services/agentPool.js';
import { isLlmAvailable, chatCompletion } from '../services/llm.js';

const app = new Hono();

app.use('*', optionalAuth);

/* ------------------------------------------------------------------ *
 * Schemas
 * ------------------------------------------------------------------ */

const analyzeSchema = z.object({
  question: z.string().min(2).max(500),
});

const dialogueSchema = z.object({
  agentId: z.string().min(1).max(64),
  question: z.string().min(2).max(500),
  previousDialogues: z.array(z.object({
    agentId: z.string(),
    name: z.string().optional(),
    text: z.string(),
  })).optional().default([]),
  sessionId: z.string().optional(),
});

const askSchema = z.object({
  agentId: z.string().min(1).max(64),
  question: z.string().min(2).max(500),
  dialogueHistory: z.array(z.object({
    speaker: z.string(),
    text: z.string(),
    agentId: z.string().optional(),
  })).optional().default([]),
  multiple: z.boolean().optional().default(false),
  count: z.number().min(2).max(5).optional().default(3),
});

const continueAskSchema = z.object({
  agentId: z.string().min(1).max(64),
  originalQuestion: z.string().min(2).max(500),
  dialogueHistory: z.array(z.object({
    speaker: z.string(),
    text: z.string(),
    agentId: z.string().optional(),
  })).optional().default([]),
  lastUserAnswer: z.string().optional().default(''),
});

const summarySchema = z.object({
  question: z.string().min(2).max(500),
  dialogues: z.array(z.object({
    agentId: z.string(),
    name: z.string().optional(),
    text: z.string(),
  })).min(1),
  agents: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
  })).optional(),
  sessionId: z.string().optional(),
});

const yanSummarySchema = z.object({
  originalQuestion: z.string().min(2).max(500),
  agentIds: z.array(z.string()).optional().default([]),
  dialogueHistory: z.record(z.array(z.string())).optional().default({}),
});

const chatSchema = z.object({
  model: z.string().optional().default('glm-4-flash'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1),
  temperature: z.number().min(0).max(1).optional().default(0.7),
  max_tokens: z.number().min(10).max(4000).optional().default(300),
});

const feedbackSchema = z.object({
  agentId: z.string().min(1).max(64),
  sessionId: z.string().optional(),
  feedbackType: z.enum([
    'too_long', 'too_short', 'off_topic', 'too_abstract', 'good', 'other',
  ]),
  feedbackText: z.string().max(500).optional(),
});

/* ------------------------------------------------------------------ *
 * GET / — 智囊列表（顺手提供）
 * ------------------------------------------------------------------ */

app.get('/', (c) => {
  return c.json({ agents: AGENTS });
});

/* ------------------------------------------------------------------ *
 * POST /analyze
 * ------------------------------------------------------------------ */

app.post('/analyze', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { question } = parsed.data;
  const result = analyzeQuestion(c.env, question);

  const userId = c.get('userId');
  if (userId) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        `UPDATE users SET total_inferences = total_inferences + 1, updated_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), userId).run().catch(() => {})
    );
  }

  return c.json(result);
});

/* ------------------------------------------------------------------ *
 * POST /dialogue
 * ------------------------------------------------------------------ */

app.post('/dialogue', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = dialogueSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { agentId, question, previousDialogues, sessionId } = parsed.data;

  let agent = getAgentById(agentId);
  
  if (!agent || agent.role !== 'advisor') {
    const body = await c.req.json().catch(() => null);
    if (body?.agentConfig && agentId.startsWith('custom_')) {
      agent = {
        id: agentId,
        name: body.agentConfig.name || '自定义智囊',
        role: 'advisor',
        persona: body.agentConfig.persona || '自定义智囊',
        perspective: body.agentConfig.stance || '综合',
        style: '周易古风',
        element: '土',
        trigram: '☷',
        color: body.agentConfig.color || '#8B8B8B',
        systemPrompt: `你是「${body.agentConfig.name || '自定义智囊'}」。
你的视角是：${body.agentConfig.stance || '综合分析'}。
你的特点：${body.agentConfig.persona || '深思熟虑'}。

回答要求：
1. 从你的专业视角分析问题，给出独特见解
2. 不超过 250 字
3. 直接进入观点，不要寒暄
4. 必须给一个具体可挑刺或可执行的细节`,
      };
    } else {
      throw errors.badRequest('未找到该智囊', 'AGENT_NOT_FOUND');
    }
  }

  const result = await generateAgentDialogue(
    c.env,
    agent,
    question,
    previousDialogues,
    null
  );

  if (sessionId) {
    try {
      const userId = c.get('userId');
      if (userId) {
        const session = await c.env.DB.prepare(
          `SELECT dialogue_history FROM inference_sessions WHERE id = ? AND user_id = ? LIMIT 1`
        ).bind(sessionId, userId).first();

        if (session) {
          const history = safeJsonParse(session.dialogue_history, []) || [];
          history.push({ agentId: result.agentId, name: agent.name, text: result.text });
          await c.env.DB.prepare(
            `UPDATE inference_sessions SET dialogue_history = ?, updated_at = ? WHERE id = ?`
          ).bind(safeJsonStringify(history), new Date().toISOString(), sessionId).run();
        }
      }
    } catch (e) {
      console.warn('[agents] 保存对话历史失败:', e.message);
    }
  }

  return c.json(result);
});

/* ------------------------------------------------------------------ *
 * POST /ask - Agent 反问用户
 * ------------------------------------------------------------------ */

app.post('/ask', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { agentId, question, dialogueHistory, multiple, count } = parsed.data;

  let agent = getAgentById(agentId);
  
  if (!agent || agent.role !== 'advisor') {
    const body = await c.req.json().catch(() => null);
    if (body?.agentConfig && agentId.startsWith('custom_')) {
      agent = {
        id: agentId,
        name: body.agentConfig.name || '自定义智囊',
        role: 'advisor',
        persona: body.agentConfig.persona || '自定义智囊',
        perspective: body.agentConfig.stance || '综合',
        style: '周易古风',
        element: '土',
        trigram: '☷',
        color: body.agentConfig.color || '#8B8B8B',
        systemPrompt: `你是「${body.agentConfig.name || '自定义智囊'}」。
你的视角是：${body.agentConfig.stance || '综合分析'}。
你的特点：${body.agentConfig.persona || '深思熟虑'}。

回答要求：
1. 从你的专业视角分析问题，给出独特见解
2. 不超过 250 字
3. 直接进入观点，不要寒暄
4. 必须给一个具体可挑刺或可执行的细节`,
      };
    } else {
      throw errors.badRequest('未找到该智囊', 'AGENT_NOT_FOUND');
    }
  }

  const history = (dialogueHistory || []).map(d => 
    `${d.speaker}: ${d.text}`
  ).join('\n');

  if (multiple) {
    const sys = `${agent.systemPrompt}

【输出要求】
- 从你的专业视角出发，提出${count}个关键问题
- 问题要能帮助深入了解用户的真实情况
- 每个问题不超过30字
- 返回格式：JSON数组，例如：["问题1", "问题2", "问题3"]`;

    const userContent = `用户问题：${question}
${history ? `\n对话历史：\n${history}` : ''}

请提出${count}个关键问题帮助了解用户情况。`;

    let questions = [];
    if (isLlmAvailable(c.env)) {
      try {
        const text = await chatCompletion(c.env, [
          { role: 'system', content: sys },
          { role: 'user', content: userContent },
        ], { temperature: 0.8, maxTokens: 300 });

        try {
          questions = JSON.parse(text);
          if (!Array.isArray(questions)) {
            questions = text.split('\n').filter(q => q.trim() && q.trim().length > 5).slice(0, count);
          }
        } catch {
          questions = text.split('\n').filter(q => q.trim() && q.trim().length > 5).slice(0, count);
        }
      } catch (e) {
        console.warn('[ask] LLM 失败，降级本地:', e.message);
      }
    }

    if (!questions || questions.length === 0) {
      const questionBank = {
        qiangu: ['隐性成本你算过吗？', '三年累计差值还划算吗？', '期权行权价多少？', '社保基数算过吗？'],
        luxiang: ['这个选择是三年题还是十年题？', '三年后你想成为什么样的人？', '赛道天花板在哪里？', '你的能力护城河够吗？'],
        fengyan: ['最坏情况是什么，能承受吗？', '备用方案准备好了吗？', '对方信息有多少不对称？', '还有哪些反面证据？'],
        xinhe: ['描述时身体放松还是紧绷？', '最近一次真正开心是什么时候？', '如果没人看着你会怎么选？', '心里其实有答案吗？'],
        yuntu: ['放进大周期看是涨潮还是退潮？', '吃Beta红利还是做Alpha？', '政策风向如何？', '行业聚集度怎样？'],
        jingyuan: ['这个"该"是谁的标准？', '如果不用考虑对错你愿意做什么？', '上次类似情况结果如何？', '你在逃避什么？'],
        zhenxing: ['再等一周处境会变好还是变差？', '第一刀切在哪里？', '窗口期还有多久？', '现在不做会后悔吗？'],
        duiyan: ['你和对方真的谈过纠结吗？', '对方的真实诉求是什么？', '还有什么没说清楚？', '换个方式沟通会怎样？'],
      };
      const qs = questionBank[agentId] || questionBank.jingyuan;
      const shuffled = [...qs].sort(() => Math.random() - 0.5);
      questions = shuffled.slice(0, count);
    }

    return c.json({ agentId, agentName: agent.name, questions, needMoreInfo: true, isMultiple: true });
  }

  const sys = `${agent.systemPrompt}

【输出要求】
- 你现在的任务是反问用户一个关键问题
- 问题必须能帮助你更好地分析用户的问题
- 问题要简短有力，不要超过 40 字
- 从你的专业视角出发提问`;

  const userContent = `用户问题：${question}
${history ? `\n对话历史：\n${history}` : ''}

请从你的视角反问用户一个关键问题。`;

  let agentQuestion = '';
  if (isLlmAvailable(c.env)) {
    try {
      agentQuestion = await chatCompletion(c.env, [
        { role: 'system', content: sys },
        { role: 'user', content: userContent },
      ], { temperature: 0.8, maxTokens: 100 });
    } catch (e) {
      console.warn('[ask] LLM 失败，降级本地:', e.message);
    }
  }

  if (!agentQuestion) {
    const questions = {
      qiangu: ['这个数字背后，隐性成本你算过吗？', '如果算上三年累计差值，还划算吗？'],
      luxiang: ['这个选择是三年题还是十年题？', '三年后回看，你想成为什么样的人？'],
      fengyan: ['最坏情况是什么，你能承受吗？', '如果这事崩了，你的备用方案是什么？'],
      xinhe: ['你描述这件事时，身体是放松还是紧绷？', '如果没有任何人看着，你会怎么选？'],
      yuntu: ['这件事放进大周期看，现在是涨潮还是退潮？', '你是在吃Beta红利，还是做Alpha？'],
      jingyuan: ['你问"该不该"，这个"该"是谁的标准？', '如果不用考虑对错，你真正愿意做什么？'],
      zhenxing: ['再等一周，你的处境会变好还是变差？', '分析够了，第一刀切在哪里？'],
      duiyan: ['你和对方真的谈过你的纠结吗？', '对方的真实诉求，你真的知道吗？'],
    };
    const qs = questions[agentId] || questions.jingyuan;
    agentQuestion = qs[Math.floor(Math.random() * qs.length)];
  }

  return c.json({ agentId, agentName: agent.name, question: agentQuestion.trim(), needMoreInfo: true, isMultiple: false });
});

/* ------------------------------------------------------------------ *
 * POST /continue-ask - 判断是否继续追问
 * ------------------------------------------------------------------ */

app.post('/continue-ask', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = continueAskSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { agentId, originalQuestion, dialogueHistory, lastUserAnswer } = parsed.data;

  let agent = getAgentById(agentId);
  
  if (!agent || agent.role !== 'advisor') {
    const body = await c.req.json().catch(() => null);
    if (body?.agentConfig && agentId.startsWith('custom_')) {
      agent = {
        id: agentId,
        name: body.agentConfig.name || '自定义智囊',
        role: 'advisor',
        persona: body.agentConfig.persona || '自定义智囊',
        perspective: body.agentConfig.stance || '综合',
        style: '周易古风',
        element: '土',
        trigram: '☷',
        color: body.agentConfig.color || '#8B8B8B',
        systemPrompt: `你是「${body.agentConfig.name || '自定义智囊'}」。
你的视角是：${body.agentConfig.stance || '综合分析'}。
你的特点：${body.agentConfig.persona || '深思熟虑'}。

回答要求：
1. 从你的专业视角分析问题，给出独特见解
2. 不超过 250 字
3. 直接进入观点，不要寒暄
4. 必须给一个具体可挑刺或可执行的细节`,
      };
    } else {
      throw errors.badRequest('未找到该智囊', 'AGENT_NOT_FOUND');
    }
  }

  const roundCount = dialogueHistory?.filter(d => d.agentId === agentId).length || 0;
  if (roundCount >= 2) {
    return c.json({ agentId, agentName: agent.name, continueAsking: false });
  }

  const trimmedAnswer = (lastUserAnswer || '').trim();
  if (!trimmedAnswer || trimmedAnswer.length < 8) {
    const questions = {
      qiangu: ['这个数字背后，隐性成本你算过吗？', '如果算上三年累计差值，还划算吗？'],
      luxiang: ['这个选择是三年题还是十年题？', '三年后回看，你想成为什么样的人？'],
      fengyan: ['最坏情况是什么，你能承受吗？', '如果这事崩了，你的备用方案是什么？'],
      xinhe: ['你描述这件事时，身体是放松还是紧绷？', '如果没有任何人看着，你会怎么选？'],
      yuntu: ['这件事放进大周期看，现在是涨潮还是退潮？', '你是在吃Beta红利，还是做Alpha？'],
      jingyuan: ['你问"该不该"，这个"该"是谁的标准？', '如果不用考虑对错，你真正愿意做什么？'],
      zhenxing: ['再等一周，你的处境会变好还是变差？', '分析够了，第一刀切在哪里？'],
      duiyan: ['你和对方真的谈过你的纠结吗？', '对方的真实诉求，你真的知道吗？'],
    };
    const qs = questions[agentId] || questions.jingyuan;
    const nextQ = qs[(roundCount + 1) % qs.length];
    return c.json({ agentId, agentName: agent.name, continueAsking: true, nextQuestion: nextQ });
  }

  return c.json({ agentId, agentName: agent.name, continueAsking: false });
});

/* ------------------------------------------------------------------ *
 * POST /summary
 * ------------------------------------------------------------------ */

app.post('/summary', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { question, dialogues, agents, sessionId } = parsed.data;

  const result = await generateSummary(c.env, question, dialogues, agents);

  if (sessionId) {
    try {
      const userId = c.get('userId');
      if (userId) {
        await c.env.DB.prepare(
          `UPDATE inference_sessions SET summary = ?, options = ?, updated_at = ? WHERE id = ? AND user_id = ?`
        ).bind(
          result.summary,
          safeJsonStringify(result.options),
          new Date().toISOString(),
          sessionId,
          userId
        ).run();
      }
    } catch (e) {
      console.warn('[agents] 保存总结失败:', e.message);
    }
  }

  return c.json(result);
});

/* ------------------------------------------------------------------ *
 * POST /feedback
 * ------------------------------------------------------------------ */

app.post('/feedback', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { agentId, sessionId, feedbackType, feedbackText } = parsed.data;
  const userId = c.get('userId');

  if (userId) {
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO agent_feedback (id, user_id, agent_id, session_id, feedback_type, feedback_text)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, agentId, sessionId || null, feedbackType, feedbackText || null).run();

    if (await hasCustomAdvisor(c, agentId, userId)) {
      await c.env.DB.prepare(
        `UPDATE custom_advisors SET feedback_count = feedback_count + 1, updated_at = ? WHERE id = ? AND user_id = ?`
      ).bind(new Date().toISOString(), agentId, userId).run().catch(() => {});
    }
  }

  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * POST /chat - 通用 LLM 对话接口
 * ------------------------------------------------------------------ */

app.post('/chat', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    throw errors.badRequest(parsed.error.errors[0]?.message || '参数错误', 'VALIDATION_ERROR');
  }
  const { model, messages, temperature, max_tokens } = parsed.data;

  let result = null;
  if (isLlmAvailable(c.env)) {
    try {
      const text = await chatCompletion(c.env, messages, { temperature, maxTokens: max_tokens });
      result = {
        model,
        choices: [{ message: { role: 'assistant', content: text } }],
      };
    } catch (e) {
      console.warn('[chat] LLM 失败:', e.message);
    }
  }

  if (!result) {
    const fallbackText = '抱歉，我暂时无法回答这个问题。请稍后再试。';
    result = {
      model,
      choices: [{ message: { role: 'assistant', content: fallbackText } }],
    };
  }

  return c.json(result);
});

/**
 * 检查是否为当前用户的自定义智囊
 */
async function hasCustomAdvisor(c, agentId, userId) {
  const r = await c.env.DB.prepare(
    `SELECT id FROM custom_advisors WHERE id = ? AND user_id = ? LIMIT 1`
  ).bind(agentId, userId).first();
  return !!r;
}

export default app;
