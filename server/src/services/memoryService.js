/**
 * 用户记忆服务
 * 管理演的长期记忆：用户画像、推演历史、对话记忆
 * 每次推演和对话后自动提取关键信息存入记忆库
 */

import { query } from './db.js';

const MEMORY_TABLE = 'user_memories';
const CONVERSATION_TABLE = 'conversations';
const CONVERSATION_MSG_TABLE = 'conversation_messages';

/**
 * 记忆类型枚举
 * - profile: 用户画像（年龄、职业、性格倾向等）
 * - inference: 推演记录摘要
 * - preference: 偏好（决策风格、常问话题等）
 * - fact: 事实信息（家人、工作、地点等）
 * - reflection: 反思回顾
 */
const MEMORY_TYPES = ['profile', 'inference', 'preference', 'fact', 'reflection', 'decision', 'commitment'];

/**
 * 写入一条记忆
 * @param {string} userId
 * @param {string} type - 记忆类型
 * @param {string} content - 记忆内容
 * @param {Object} meta - 元数据（关联的推演ID、来源等）
 * @param {number} importance - 重要度 1-10
 */
export async function addMemory(userId, type, content, meta = {}, importance = 3) {
  if (!userId || !type || !content) return null;
  if (!MEMORY_TYPES.includes(type)) return null;

  const record = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    type,
    content: String(content).slice(0, 1000),
    meta: JSON.stringify(meta),
    importance: Math.max(1, Math.min(10, importance)),
    created_at: new Date().toISOString(),
  };

  try {
    await query({ table: MEMORY_TABLE, action: 'insert', data: record });
    return record;
  } catch (e) {
    console.warn('[memory] addMemory 失败:', e.message);
    return null;
  }
}

/**
 * 检索相关记忆（简单关键词匹配 + 重要度排序）
 * @param {string} userId
 * @param {string} queryText - 用于匹配的文本
 * @param {number} limit - 返回条数
 */
export async function retrieveMemories(userId, queryText = '', limit = 8) {
  if (!userId) return [];

  try {
    // 先取所有记忆，再做简单打分
    const result = await query({
      table: MEMORY_TABLE,
      action: 'select',
      filter: { user_id: userId },
      queryOptions: { orderBy: 'created_at:desc', limit: 50 },
    });

    let memories = result.rows || [];

    // 如果有查询文本，做简单关键词匹配打分
    if (queryText && queryText.length > 0) {
      const keywords = queryText.toLowerCase().split(/[\s，。？、,.?!]+/).filter(Boolean);
      memories = memories.map(m => {
        let score = m.importance || 3;
        const content = (m.content || '').toLowerCase();
        for (const kw of keywords) {
          if (kw.length >= 2 && content.includes(kw)) score += 2;
        }
        return { ...m, _score: score };
      });
      memories.sort((a, b) => b._score - a._score);
    }

    return memories.slice(0, limit).map(m => ({
      id: m.id,
      type: m.type,
      content: m.content,
      importance: m.importance,
      createdAt: m.created_at,
      meta: m.meta ? safeJsonParse(m.meta) : {},
    }));
  } catch (e) {
    console.warn('[memory] retrieveMemories 失败:', e.message);
    return [];
  }
}

/**
 * 获取用户画像类记忆汇总
 */
export async function getUserProfile(userId) {
  if (!userId) return '';
  const memories = await retrieveMemories(userId, '', 20);
  const profileMemories = memories.filter(m => m.type === 'profile' || m.type === 'preference' || m.type === 'fact');
  if (profileMemories.length === 0) return '';
  return profileMemories.map(m => `- ${m.content}`).join('\n');
}

/**
 * 从推演结果中提取记忆
 * 提取四类记忆：问题主题(preference)、选择选项(decision)、承诺文本(commitment)、卦象结果(fact)
 * @param {string} userId
 * @param {Object} inferenceData - 推演数据 { question, summary, selectedChoice, commitText, agentIds }
 */
export async function extractMemoriesFromInference(userId, inferenceData) {
  if (!userId || !inferenceData) return [];

  const {
    question = '',
    summary = '',
    selectedChoice,
    commitText,
    agentIds = [],
  } = inferenceData;

  const memories = [];

  // 1. 推演记录摘要（总是保存）
  const summaryText = String(summary || '').slice(0, 200);
  memories.push(await addMemory(userId, 'inference',
    `问「${String(question).slice(0, 50)}」，择「${selectedChoice || '未定'}」。${summaryText.slice(0, 100)}`,
    { question, choice: selectedChoice, source: 'inference', agentIds },
    4
  ));

  // 2. 用户的问题主题 → preference 类型
  if (question) {
    const topic = detectQuestionTopic(question);
    if (topic) {
      memories.push(await addMemory(userId, 'preference',
        `常关注${topic}类问题`,
        { source: 'inference', topic, question: question.slice(0, 80) },
        2
      ));
    }
  }

  // 3. 用户选择的选项 → decision 类型
  if (selectedChoice) {
    const choiceStr = typeof selectedChoice === 'string' ? selectedChoice : JSON.stringify(selectedChoice);
    memories.push(await addMemory(userId, 'decision',
      `于「${String(question).slice(0, 40)}」一事中，择「${choiceStr.slice(0, 50)}」`,
      { source: 'inference', question: question.slice(0, 80), choice: selectedChoice },
      5
    ));

    // 决策风格推断
    const choiceLower = choiceStr.toLowerCase();
    let prefType = null;
    if (choiceLower.includes('稳') || choiceLower.includes('守') || choiceLower.includes('避风险') || choiceLower.includes('留')) {
      prefType = '决策风格偏保守稳妥';
    } else if (choiceLower.includes('机') || choiceLower.includes('探索') || choiceLower.includes('冒') || choiceLower.includes('冲') || choiceLower.includes('接受')) {
      prefType = '决策风格偏积极进取';
    }
    if (prefType) {
      memories.push(await addMemory(userId, 'preference', prefType,
        { source: 'inference', question: question.slice(0, 80) }, 3));
    }
  }

  // 4. 用户的承诺文本 → commitment 类型
  if (commitText && String(commitText).trim()) {
    memories.push(await addMemory(userId, 'commitment',
      `曾立誓：「${String(commitText).trim().slice(0, 100)}」`,
      { source: 'inference', question: question.slice(0, 80) },
      6
    ));
  }

  // 5. 推演的卦象结果 → fact 类型
  const guaText = String(summary || '') + (typeof selectedChoice === 'string' ? selectedChoice : '');
  const gua = detectGua(guaText);
  if (gua) {
    memories.push(await addMemory(userId, 'fact',
      `推演得「${gua}」之卦`,
      { source: 'inference', gua, question: question.slice(0, 80) },
      3
    ));
  }

  return memories.filter(Boolean);
}

/**
 * 简单话题检测
 */
function detectQuestionTopic(question) {
  if (!question) return null;
  if (/工作|offer|跳槽|转行|升职|离职|辞职|入职|岗位|职场/.test(question)) return '职业发展';
  if (/钱|投资|理财|股票|基金|买房|贷款|消费|预算|薪|工资|存款/.test(question)) return '财务理财';
  if (/恋爱|分手|结婚|离婚|表白|暗恋|感情|对象|男友|女友|喜欢|爱/.test(question)) return '感情关系';
  if (/创业|开公司|融|合伙|辞职创业/.test(question)) return '创业';
  if (/身体|健康|生病|熬夜|睡眠|焦虑|抑郁|体检/.test(question)) return '健康';
  if (/考研|读研|留学|考公|证书|学习|培训|进修/.test(question)) return '学业进修';
  return null;
}

/**
 * 从文本中检测卦象
 */
const GUA_NAMES = ['乾', '坤', '屯', '蒙', '需', '讼', '师', '比', '小畜', '履', '泰', '否', '同人', '大有', '谦', '豫', '随', '蛊', '临', '观', '噬嗑', '贲', '剥', '复', '无妄', '大畜', '颐', '大过', '坎', '离', '咸', '恒', '遁', '大壮', '晋', '明夷', '家人', '睽', '蹇', '解', '损', '益', '夬', '姤', '萃', '升', '困', '井', '革', '鼎', '震', '艮', '渐', '归妹', '丰', '旅', '巽', '兑', '涣', '节', '中孚', '小过', '既济', '未济'];

function detectGua(text) {
  if (!text) return null;
  for (const gua of GUA_NAMES) {
    if (text.includes(gua)) return gua;
  }
  return null;
}

/* ========== 对话记忆 ========== */

/**
 * 获取或创建当前会话
 */
export async function getOrCreateConversation(userId, title = '与演的对话') {
  if (!userId) return null;

  // 查找最近 24 小时内的活跃会话
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await query({
      table: CONVERSATION_TABLE,
      action: 'select',
      filter: { user_id: userId },
      queryOptions: { orderBy: 'updated_at:desc', limit: 1 },
    });

    if (result.rows && result.rows.length > 0) {
      const conv = result.rows[0];
      if (conv.updated_at > oneDayAgo) {
        // 更新活跃时间
        await query({
          table: CONVERSATION_TABLE,
          action: 'update',
          id: conv.id,
          data: { updated_at: new Date().toISOString() },
        });
        return conv;
      }
    }
  } catch (e) { /* ignore */ }

  // 创建新会话
  const conv = {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    title: title.slice(0, 100),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await query({ table: CONVERSATION_TABLE, action: 'insert', data: conv });
    return conv;
  } catch (e) {
    console.warn('[memory] 创建会话失败:', e.message);
    return conv;
  }
}

/**
 * 保存对话消息
 */
export async function addMessage(conversationId, role, content, meta = {}) {
  if (!conversationId || !role || !content) return null;

  const msg = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: conversationId,
    role, // 'user' | 'assistant'
    content: String(content).slice(0, 2000),
    meta: JSON.stringify(meta),
    created_at: new Date().toISOString(),
  };

  try {
    await query({ table: CONVERSATION_MSG_TABLE, action: 'insert', data: msg });
    return msg;
  } catch (e) {
    console.warn('[memory] addMessage 失败:', e.message);
    return null;
  }
}

/**
 * 获取最近的对话历史（用于上下文）
 */
export async function getRecentMessages(conversationId, limit = 20) {
  if (!conversationId) return [];

  try {
    const result = await query({
      table: CONVERSATION_MSG_TABLE,
      action: 'select',
      filter: { conversation_id: conversationId },
      queryOptions: { orderBy: 'created_at:desc', limit },
    });
    const rows = (result.rows || []).reverse(); // 按时间正序
    return rows.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    }));
  } catch (e) {
    console.warn('[memory] getRecentMessages 失败:', e.message);
    return [];
  }
}

/**
 * 从对话中提取记忆（用户说的重要信息）
 * 简单规则：如果用户消息包含特定关键词，提取为记忆
 */
export async function extractMemoriesFromChat(userId, userMessage, assistantReply) {
  if (!userId || !userMessage) return [];

  const memories = [];
  const msg = userMessage.toLowerCase();

  // 简单的关键词触发记忆提取
  const patterns = [
    { re: /我是(?:一个|一名|做)?(.{1,15})(?:的|工作|职业)/, type: 'profile', importance: 5 },
    { re: /我今年(\d+)(?:岁)?/, type: 'profile', importance: 4 },
    { re: /我(?:喜欢|爱|爱好)(.{1,15})/, type: 'preference', importance: 3 },
    { re: /我(?:在|来自|住)(.{1,15})/, type: 'fact', importance: 3 },
    { re: /我(?:老婆|老公|女朋友|男朋友|家人|父母|孩子)(.{0,20})/, type: 'fact', importance: 4 },
  ];

  for (const p of patterns) {
    const m = userMessage.match(p.re);
    if (m && m[1]) {
      const content = `${p.type === 'profile' ? '用户' : ''}${m[0].replace(/^我/, '')}`;
      memories.push(await addMemory(userId, p.type, content, { source: 'chat' }, p.importance));
    }
  }

  return memories.filter(Boolean);
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

export default {
  addMemory,
  retrieveMemories,
  getUserProfile,
  extractMemoriesFromInference,
  getOrCreateConversation,
  addMessage,
  getRecentMessages,
  extractMemoriesFromChat,
};
