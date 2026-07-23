/**
 * MultiAgent 框架 - 生产级多Agent协作系统
 * 
 * 核心设计理念:
 * 1. 每个Agent是独立的思考单元，拥有自己的角色、目标和记忆
 * 2. Agent间通过共享上下文进行协作和辩论
 * 3. 支持动态创建和销毁Agent
 * 4. 状态机管理流程阶段
 * 5. 实现Agent间的消息传递机制
 */

import * as apiClient from './apiClient';
import { API_BASE_URL } from './baseConfig.js';

async function callChatApi(messages, model = 'glm-4-flash', temperature = 0.7, maxTokens = 300) {
  const resp = await fetch(`${API_BASE_URL}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Chat API 失败 ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data;
}

class AgentMemory {
  constructor() {
    this.history = [];
    this.knowledge = new Map();
  }

  addMessage(role, content, metadata = {}) {
    this.history.push({ role, content, timestamp: Date.now(), ...metadata });
  }

  getRecentHistory(count = 5) {
    return this.history.slice(-count);
  }

  addKnowledge(key, value) {
    this.knowledge.set(key, value);
  }

  getKnowledge(key) {
    return this.knowledge.get(key);
  }

  clear() {
    this.history = [];
    this.knowledge.clear();
  }
}

/**
 * Blackboard - 共享黑板（消息总线）
 * 借鉴 MetaGPT 的 Environment 模式：Agent 通过 publish 发布结构化消息，通过 observe 订阅
 *
 * 消息结构：{ id, agentId, role, round, content, confidence, references:[msgId], msgType, targetAgentId?, timestamp }
 * msgType: claim(表态) / rebuttal(反驳) / support(补充) / question(追问) / verdict(裁决)
 */
class Blackboard {
  constructor() {
    this.messages = [];
    this.byType = new Map();      // 按 msgType 索引
    this.byAgent = new Map();     // 按 agentId 索引
  }

  /**
   * 发布一条结构化消息到黑板
   * @param {object} msg - 消息对象
   */
  publish(msg) {
    // 补全字段
    if (!msg.id) {
      msg.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!msg.timestamp) msg.timestamp = Date.now();
    if (!msg.msgType) msg.msgType = 'claim';
    if (typeof msg.confidence !== 'number') msg.confidence = 0.7;
    if (!Array.isArray(msg.references)) msg.references = [];

    this.messages.push(msg);

    // 更新索引
    if (!this.byType.has(msg.msgType)) this.byType.set(msg.msgType, []);
    this.byType.get(msg.msgType).push(msg);

    if (!this.byAgent.has(msg.agentId)) this.byAgent.set(msg.agentId, []);
    this.byAgent.get(msg.agentId).push(msg);

    return msg;
  }

  /**
   * Agent 订阅自己关心的消息（默认看全部 claim/rebuttal/support/question，不看 judge 内部）
   * @param {string} agentId - 订阅者 Agent ID（排除自己的消息）
   * @param {Array<string>} msgTypes - 关心的消息类型
   * @returns {Array} 观察到的消息
   */
  observe(agentId, msgTypes = ['claim', 'rebuttal', 'support', 'question']) {
    return this.messages.filter(m =>
      msgTypes.includes(m.msgType) && m.agentId !== agentId
    );
  }

  /**
   * 获取某轮次的所有消息
   */
  getByRound(round) {
    return this.messages.filter(m => m.round === round);
  }

  /**
   * 获取某个 Agent 的所有消息
   */
  getByAgent(agentId) {
    return this.byAgent.get(agentId) || [];
  }

  /**
   * 获取最近 N 条消息
   */
  getRecent(count = 10) {
    return this.messages.slice(-count);
  }

  /**
   * 循环检测：最近 N 条消息相似度超阈值
   * 简化版：用文本前40字做指纹，一半重复 = 循环
   */
  detectLoop(threshold = 0.5, window = 6) {
    const recent = this.messages.slice(-window);
    if (recent.length < window) return false;
    const fingerprints = recent.map(m => (m.content || '').slice(0, 40));
    const unique = new Set(fingerprints);
    return (unique.size / window) < threshold;
  }

  /**
   * 格式化消息为 LLM 可读的上下文文本
   */
  formatForPrompt(agentId, maxMessages = 8) {
    const observed = this.observe(agentId);
    const recent = observed.slice(-maxMessages);
    if (recent.length === 0) return '（你是第一个发言的智囊）';

    return recent.map(m => {
      const typeLabel = {
        claim: '表态',
        rebuttal: '反驳',
        support: '补充',
        question: '追问',
        verdict: '裁决',
      }[m.msgType] || m.msgType;

      const targetLabel = m.targetAgentId ? `→@${m.targetAgentId}` : '';
      const refLabel = m.references?.length ? ` (回应了${m.references.length}条)` : '';

      return `[${typeLabel}${targetLabel}] ${m.agentId}（第${m.round}轮）: ${m.content}${refLabel}`;
    }).join('\n');
  }

  /**
   * 清空黑板
   */
  clear() {
    this.messages = [];
    this.byType.clear();
    this.byAgent.clear();
  }
}

class Agent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.stance = config.stance || config.perspective;
    this.persona = config.persona || config.systemPrompt || '';
    this.icon = config.icon || '';
    this.color = config.color || '#C8A850';
    this.glow = config.glow || '#F0D890';
    this.role = config.role || 'dynamic';
    this.questionTypes = config.questionTypes || [];
    this.maxFollowUpDepth = config.maxFollowUpDepth || 3;
    this.currentFollowUpDepth = 0;
    this.memory = new AgentMemory();
    this.isActive = false;
    this.lastResponse = '';
    this.shouldContinueAsking = false;
    this.team = null;           // 引用所属 AgentTeam（用于访问 blackboard）
    this.currentRound = 0;      // 当前辩论轮次
  }

  /**
   * 向黑板发布一条结构化消息（真协作的基础）
   * @param {string} content - 消息内容
   * @param {string} msgType - 消息类型：claim/rebuttal/support/question/verdict
   * @param {string} targetAgentId - 定向消息目标（可选）
   * @param {Array<string>} references - 引用的前置消息 ID
   * @param {number} confidence - 信心分 0-1
   * @returns {object} 发布的消息对象
   */
  sendTo(content, msgType = 'claim', targetAgentId = null, references = [], confidence = 0.7) {
    const msg = {
      agentId: this.id,
      role: this.role || 'dynamic',
      round: this.currentRound,
      content,
      confidence,
      references,
      msgType,
      targetAgentId,
    };

    if (this.team?.blackboard) {
      return this.team.blackboard.publish(msg);
    }
    // 没有 team 时，返回消息但不发布
    msg.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    msg.timestamp = Date.now();
    return msg;
  }

  /**
   * 观察黑板上的消息（订阅其他智囊的发言）
   * @param {Array<string>} msgTypes - 关心的消息类型
   * @returns {Array} 观察到的消息
   */
  observe(msgTypes = ['claim', 'rebuttal', 'support', 'question']) {
    if (this.team?.blackboard) {
      return this.team.blackboard.observe(this.id, msgTypes);
    }
    return [];
  }

  activate() {
    this.isActive = true;
    this.currentFollowUpDepth = 0;
  }

  deactivate() {
    this.isActive = false;
    this.currentFollowUpDepth = 0;
  }

  reset() {
    this.memory.clear();
    this.currentFollowUpDepth = 0;
    this.lastResponse = '';
    this.shouldContinueAsking = false;
  }

  async ask(question, context = {}) {
    const history = this.memory.getRecentHistory(5);
    const messages = [
      { role: 'system', content: this.persona },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: question }
    ];

    try {
      const response = await callChatApi(messages, 'glm-4-flash', 0.7, 300);

      const text = response?.choices?.[0]?.message?.content || '';
      this.lastResponse = text;
      this.memory.addMessage('assistant', text, { question });
      return text;
    } catch (e) {
      console.warn(`[Agent] ${this.name} 提问失败`, e);
      return this.generateFallbackQuestion(question);
    }
  }

  async askMultiple(question, count = 3) {
    const history = this.memory.getRecentHistory(5);
    const systemPrompt = `${this.persona}

【输出要求】
- 从你的专业视角出发，提出${count}个关键问题
- 问题要能帮助深入了解用户的真实情况
- 每个问题不超过30字
- 返回格式：JSON数组，例如：["问题1", "问题2", "问题3"]`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: question }
    ];

    try {
      const response = await callChatApi(messages, 'glm-4-flash', 0.7, 400);

      const text = response?.choices?.[0]?.message?.content || '[]';
      let questions = [];
      try {
        questions = JSON.parse(text);
        if (!Array.isArray(questions)) {
          questions = text.split('\n').filter(q => q.trim() && q.trim().length > 5).slice(0, count);
        }
      } catch {
        questions = text.split('\n').filter(q => q.trim() && q.trim().length > 5).slice(0, count);
      }

      if (questions.length === 0) {
        throw new Error('未生成有效问题');
      }

      const questionsText = questions.join('\n');
      this.lastResponse = questionsText;
      this.memory.addMessage('assistant', questionsText, { question, isMultiple: true, questionCount: questions.length });
      return questions;
    } catch (e) {
      console.warn(`[Agent] ${this.name} 多问题提问失败`, e);
      return this.generateFallbackMultipleQuestions(question, count);
    }
  }

  generateFallbackMultipleQuestions(question, count) {
    const baseQuestions = [
      `从${this.stance}看，你最在意的是什么？`,
      `这个选择对你来说意味着什么？`,
      `如果失败了，你能接受吗？`,
      `你已经尝试过哪些方法？`,
      `什么会让你改变主意？`,
      `这个问题背后还有什么更深层的考虑？`,
    ];
    const shuffled = [...baseQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async judgeContinueAsking(userAnswer) {
    if (this.currentFollowUpDepth >= this.maxFollowUpDepth) {
      this.shouldContinueAsking = false;
      return false;
    }

    const history = this.memory.getRecentHistory(5);
    const messages = [
      { role: 'system', content: `${this.persona}\n\n请判断用户的回答是否足够详细，是否需要继续追问。回答格式：{"shouldContinue": true/false, "reason": "原因"}` },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userAnswer },
      { role: 'system', content: '请判断是否需要继续追问，并给出理由。只能返回JSON格式。' }
    ];

    try {
      const response = await callChatApi(messages, 'glm-4-flash', 0.3, 100);

      const text = response?.choices?.[0]?.message?.content || '{"shouldContinue": false, "reason": "回答足够详细"}';
      const result = JSON.parse(text);
      this.shouldContinueAsking = result.shouldContinue;
      return result.shouldContinue;
    } catch (e) {
      console.warn(`[Agent] ${this.name} 判断失败`, e);
      return this.currentFollowUpDepth < 2;
    }
  }

  async followUp(userAnswer) {
    this.currentFollowUpDepth++;
    const history = this.memory.getRecentHistory(5);
    const messages = [
      { role: 'system', content: `${this.persona}\n\n基于用户之前的回答，继续深入追问一个问题。` },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: userAnswer },
      { role: 'system', content: '请基于用户的回答，提出一个更深层次的追问问题。' }
    ];

    try {
      const response = await callChatApi(messages, 'glm-4-flash', 0.7, 200);

      const text = response?.choices?.[0]?.message?.content || '';
      this.lastResponse = text;
      this.memory.addMessage('assistant', text, { isFollowUp: true, depth: this.currentFollowUpDepth });
      return text;
    } catch (e) {
      console.warn(`[Agent] ${this.name} 追问失败`, e);
      return this.generateFallbackFollowUp(userAnswer);
    }
  }

  generateFallbackQuestion(question) {
    const fallbacks = [
      `从${this.stance}的角度看，你最在意的是什么？`,
      `在${this.stance}上，这个问题的关键点在哪里？`,
      `如果从${this.stance}出发，你会如何权衡利弊？`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  generateFallbackFollowUp(answer) {
    const fallbacks = [
      `你提到了${answer.slice(0, 10)}…这背后还有什么更深层的考虑吗？`,
      `如果继续深挖，你觉得还有哪些因素需要考虑？`,
      `从${this.stance}看，还有什么信息是你没说出来的？`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

class AgentTeam {
  constructor() {
    this.agents = new Map();
    this.activeAgents = [];
    this.turnOrder = [];
    this.currentTurn = 0;
    this.currentRound = 1;          // 当前辩论轮次（Wald SPRT 用）
    this.globalMemory = new AgentMemory();
    this.blackboard = new Blackboard();  // 共享黑板（消息总线）
    this.onAgentUpdate = null;
    this.debateConfig = {
      maxRounds: 3,                 // 轮次硬上限
      consensusThreshold: 0.8,      // 共识分阈值
      loopSimilarity: 0.85,         // 循环检测相似度
      loopWindow: 6,                // 循环检测窗口
    };
  }

  addAgent(config) {
    const agent = new Agent(config);
    agent.team = this;              // 让 Agent 持有 team 引用，sendTo/observe 可用
    this.agents.set(agent.id, agent);
    return agent;
  }

  removeAgent(agentId) {
    this.agents.delete(agentId);
    this.activeAgents = this.activeAgents.filter(a => a.id !== agentId);
    this.turnOrder = this.turnOrder.filter(id => id !== agentId);
  }

  activateAgents(agentIds) {
    this.activeAgents = agentIds
      .map(id => this.agents.get(id))
      .filter(Boolean);
    this.turnOrder = agentIds;
    this.currentTurn = 0;
  }

  async createDynamicAgent(spec) {
    const agentConfig = {
      id: `dynamic_${Date.now()}`,
      name: spec.name,
      stance: spec.stance,
      persona: spec.persona,
      icon: spec.icon || '☯',
      color: spec.color || '#C8A850',
      glow: spec.glow || '#F0D890',
      role: 'dynamic',
      maxFollowUpDepth: 3,
    };

    const agent = this.addAgent(agentConfig);
    this.activeAgents.push(agent);
    this.turnOrder.push(agent.id);

    if (this.onAgentUpdate) {
      this.onAgentUpdate('created', agent);
    }

    return agent;
  }

  async analyzeAndCreateAgents(question, questionType) {
    const systemPrompt = `
你是演，一个智慧的推演者。根据用户的问题，分析需要哪些专家Agent来帮助思考。

用户问题：${question}
问题类型：${questionType?.label || '未知'}

请创建3-5个专家Agent，每个Agent需要：
- name: 中文名字（1-2个字）
- stance: 专业视角（如：财务、风险、情感、职业等）
- persona: 详细的人物设定，包括背景、风格、回答特点
- icon: 代表符号（可用八卦符号）
- color: 主题色（十六进制）

返回格式：JSON数组，例如：
[{"name": "钱谷", "stance": "财务视角", "persona": "...", "icon": "☰", "color": "#C88848"}]
`;

    try {
      const response = await callChatApi([{ role: 'system', content: systemPrompt }], 'glm-4-flash', 0.6, 800);

      const text = response?.choices?.[0]?.message?.content || '[]';
      const agentSpecs = JSON.parse(text);

      const createdAgents = [];
      for (const spec of agentSpecs) {
        const agent = await this.createDynamicAgent(spec);
        createdAgents.push(agent);
      }

      return createdAgents;
    } catch (e) {
      console.warn('[AgentTeam] 动态创建Agent失败', e);
      return [];
    }
  }

  getCurrentAgent() {
    if (this.currentTurn >= this.turnOrder.length) return null;
    const agentId = this.turnOrder[this.currentTurn];
    return this.agents.get(agentId);
  }

  nextTurn() {
    this.currentTurn++;
  }

  resetTurns() {
    this.currentTurn = 0;
    this.activeAgents.forEach(a => a.reset());
  }

  addGlobalMessage(role, content) {
    this.globalMemory.addMessage(role, content);
  }

  getGlobalContext() {
    return this.globalMemory.getRecentHistory(20);
  }

  async processTurn(question) {
    const agent = this.getCurrentAgent();
    if (!agent) return null;

    agent.activate();

    if (this.onAgentUpdate) {
      this.onAgentUpdate('active', agent);
    }

    let response;
    if (agent.currentFollowUpDepth === 0) {
      response = await agent.ask(question);
    } else {
      response = await agent.followUp(question);
    }

    this.addGlobalMessage('assistant', `【${agent.name}】${response}`, { agentId: agent.id });

    if (this.onAgentUpdate) {
      this.onAgentUpdate('responded', agent, response);
    }

    return { agent, response };
  }

  async judgeAndContinue(userAnswer) {
    const agent = this.getCurrentAgent();
    if (!agent) return { shouldContinue: false, nextQuestion: '' };

    const shouldContinue = await agent.judgeContinueAsking(userAnswer);

    if (shouldContinue) {
      const nextQuestion = await agent.followUp(userAnswer);
      return { shouldContinue: true, nextQuestion };
    }

    return { shouldContinue: false, nextQuestion: '' };
  }

  async generateSummary() {
    const context = this.getGlobalContext();
    const agentNames = this.activeAgents.map(a => a.name).join('、');

    const systemPrompt = `
你是演，一个智慧的推演者。请根据以下对话历史，总结所有Agent的观点，并给出3-4个决策选项。

参与的专家：${agentNames}

对话历史：
${context.map(m => `${m.role === 'assistant' ? '[助手]' : '[用户]'}: ${m.content}`).join('\n')}

请输出：
1. 全局总结：用一段话总结所有观点
2. 决策选项：3-4个选项，每个选项包含：
   - id: 唯一标识（英文）
   - label: 选项名称（中文）
   - summary: 关键点摘要
   - reasoning: 推荐理由

返回格式：JSON
`;

    try {
      const response = await callChatApi([{ role: 'system', content: systemPrompt }], 'glm-4-flash', 0.5, 1000);

      const text = response?.choices?.[0]?.message?.content || '{}';
      return JSON.parse(text);
    } catch (e) {
      console.warn('[AgentTeam] 生成总结失败', e);
      return null;
    }
  }

  async generateDivination(question, choiceId) {
    const context = this.getGlobalContext();

    const systemPrompt = `
你是演，一个精通周易卜卦的推演者。请为用户的选择进行卦象推演。

问题：${question}
选择：${choiceId}

对话历史：
${context.map(m => m.content).slice(-10).join('\n')}

请输出：
- trigram: 卦象符号（如：☰）
- interpretation: 卦象解读
- pathDescription: 路径描述（对这个选择的未来推演）
- advice: 建议

返回格式：JSON
`;

    try {
      const response = await callChatApi([{ role: 'system', content: systemPrompt }], 'glm-4-flash', 0.6, 500);

      const text = response?.choices?.[0]?.message?.content || '{}';
      return JSON.parse(text);
    } catch (e) {
      console.warn('[AgentTeam] 生成卜卦失败', e);
      return null;
    }
  }

  /**
   * 辩论主循环 - 带 Wald SPRT 自适应收敛检测
   * 三个收敛信号任一触发即结束：
   *   1. 轮次达硬上限（maxRounds）
   *   2. 共识分 ≥ consensusThreshold（用 confidence 均值近似）
   *   3. 循环检测（最近 N 条消息一半重复）
   *
   * @param {string} question - 用户问题
   * @param {function} generateTurn - 单轮生成函数 (agent, blackboardCtx) => Promise<{content, msgType, targetAgentId?, references?, confidence?}>
   * @returns {Promise<{rounds: number, convergedBy: string, messages: Array}>}
   */
  async runDebate(question, generateTurn) {
    const { maxRounds, loopWindow } = this.debateConfig;
    const rounds = [];
    let convergedBy = 'max_rounds';

    for (let round = 1; round <= maxRounds; round++) {
      this.currentRound = round;
      const roundMessages = [];

      // 按发言顺序逐个 Agent 出场
      for (const agentId of this.turnOrder) {
        const agent = this.agents.get(agentId);
        if (!agent) continue;

        agent.activate();
        agent.currentRound = round;

        if (this.onAgentUpdate) {
          this.onAgentUpdate('active', agent, { round });
        }

        try {
          // 调用外部传入的单轮生成函数，传入 agent 和 blackboard 上下文
          const blackboardCtx = this.blackboard.formatForPrompt(agent.id, 8);
          const turn = await generateTurn(agent, blackboardCtx, question, round);

          if (turn && turn.content) {
            // 通过 sendTo 自动 publish 到 blackboard
            const published = agent.sendTo(
              turn.content,
              turn.msgType || 'claim',
              turn.targetAgentId || null,
              turn.references || [],
              typeof turn.confidence === 'number' ? turn.confidence : 0.7
            );
            roundMessages.push(published);

            // 同步到全局记忆（兼容老流程）
            this.addGlobalMessage('assistant', `【${agent.name}】${turn.content}`, { agentId: agent.id, round });

            if (this.onAgentUpdate) {
              this.onAgentUpdate('responded', agent, turn.content, { round, msg: published });
            }
          }
        } catch (e) {
          console.warn(`[runDebate] ${agent.name} 第${round}轮失败:`, e.message);
        }
      }

      rounds.push({ round, messages: roundMessages });

      // 收敛信号检测
      const convergence = this.detectConvergence();
      if (convergence.converged) {
        convergedBy = convergence.reason;
        break;
      }
    }

    return {
      rounds: rounds.length,
      convergedBy,
      messages: this.blackboard.messages,
      roundsDetail: rounds,
    };
  }

  /**
   * 收敛检测 - Wald SPRT 三信号
   * @returns {{converged: boolean, reason: string, consensusScore?: number, loopDetected?: boolean}}
   */
  detectConvergence() {
    const { consensusThreshold, loopSimilarity, loopWindow } = this.debateConfig;
    const allMessages = this.blackboard.messages;

    // 信号1：消息过少，不判定
    if (allMessages.length < 3) {
      return { converged: false, reason: 'insufficient' };
    }

    // 信号2：循环检测（最近 N 条消息指纹重复率）
    const recent = allMessages.slice(-loopWindow);
    if (recent.length >= loopWindow) {
      const fingerprints = recent.map(m => (m.content || '').slice(0, 40).toLowerCase());
      const unique = new Set(fingerprints);
      const uniqueness = unique.size / fingerprints.length;
      // uniqueness < (1 - loopSimilarity) 视为循环
      if (uniqueness < (1 - loopSimilarity)) {
        return { converged: true, reason: 'loop_detected', loopDetected: true, uniqueness };
      }
    }

    // 信号3：共识分（用最近一轮 confidence 均值近似）
    const lastRound = Math.max(...allMessages.map(m => m.round || 0));
    const lastRoundMessages = allMessages.filter(m => m.round === lastRound);
    if (lastRoundMessages.length > 0) {
      const avgConfidence = lastRoundMessages.reduce((sum, m) => sum + (m.confidence || 0.5), 0) / lastRoundMessages.length;
      if (avgConfidence >= consensusThreshold) {
        return { converged: true, reason: 'consensus', consensusScore: avgConfidence };
      }
      return { converged: false, reason: 'low_consensus', consensusScore: avgConfidence };
    }

    return { converged: false, reason: 'continue' };
  }

  /**
   * 获取 blackboard 的格式化上下文（供外部 LLM 调用使用）
   */
  getBlackboardContext(agentId, maxMessages = 8) {
    return this.blackboard.formatForPrompt(agentId, maxMessages);
  }

  clear() {
    this.agents.clear();
    this.activeAgents = [];
    this.turnOrder = [];
    this.currentTurn = 0;
    this.currentRound = 1;
    this.globalMemory.clear();
    this.blackboard.clear();
  }
}

/**
 * 独立收敛检测 - Wald SPRT 三信号（不依赖 AgentTeam 实例）
 * 供 Game.jsx 在 generateDialoguesForAgents 跑完后调用，决定是否再辩一轮
 * @param {Blackboard} blackboard
 * @param {{maxRounds?: number, consensusThreshold?: number, loopSimilarity?: number, loopWindow?: number, currentRound?: number}} config
 * @returns {{converged: boolean, reason: string, consensusScore?: number, loopDetected?: boolean, uniqueness?: number}}
 */
export function detectConvergenceFromBlackboard(blackboard, config = {}) {
  const {
    consensusThreshold = 0.8,
    loopSimilarity = 0.85,
    loopWindow = 6,
    currentRound = 1,
  } = config;
  const allMessages = blackboard.messages;

  // 信号1：消息过少，不判定
  if (allMessages.length < 3) {
    return { converged: false, reason: 'insufficient' };
  }

  // 信号2：循环检测（最近 N 条消息指纹重复率）
  const recent = allMessages.slice(-loopWindow);
  if (recent.length >= loopWindow) {
    const fingerprints = recent.map(m => (m.content || '').slice(0, 40).toLowerCase());
    const unique = new Set(fingerprints);
    const uniqueness = unique.size / fingerprints.length;
    // uniqueness < (1 - loopSimilarity) 视为循环
    if (uniqueness < (1 - loopSimilarity)) {
      return { converged: true, reason: 'loop_detected', loopDetected: true, uniqueness };
    }
  }

  // 信号3：共识分（用当前轮 confidence 均值近似）
  const lastRoundMessages = allMessages.filter(m => m.round === currentRound);
  if (lastRoundMessages.length > 0) {
    const avgConfidence = lastRoundMessages.reduce((sum, m) => sum + (m.confidence || 0.5), 0) / lastRoundMessages.length;
    if (avgConfidence >= consensusThreshold) {
      return { converged: true, reason: 'consensus', consensusScore: avgConfidence };
    }
    return { converged: false, reason: 'low_consensus', consensusScore: avgConfidence };
  }

  return { converged: false, reason: 'continue' };
}

export { Agent, AgentTeam, AgentMemory, Blackboard };
