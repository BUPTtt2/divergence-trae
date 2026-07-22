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

const API_BASE_URL = apiClient.API_BASE_URL || '';

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
    this.globalMemory = new AgentMemory();
    this.onAgentUpdate = null;
  }

  addAgent(config) {
    const agent = new Agent(config);
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

  clear() {
    this.agents.clear();
    this.activeAgents = [];
    this.turnOrder = [];
    this.currentTurn = 0;
    this.globalMemory.clear();
  }
}

export { Agent, AgentTeam, AgentMemory };
