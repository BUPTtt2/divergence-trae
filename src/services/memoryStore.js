/**
 * 分层记忆存储 - 本地降级方案（决策回顾闭环）
 *
 * 四层记忆（借鉴记忆认知模型）：
 * - working: 工作记忆，当前会话临时上下文（短时）
 * - facts: 事实记忆，从会话提取的长期事实（如"用户偏好稳定"）
 * - episodes: 情景记忆，每次推演完整记录，30 天后到期回访
 * - semantic: 语义记忆，模式识别（如"用户连续3次选了稳定项"）
 *
 * 存储位置：localStorage，key 前缀 yance:memory:
 * 与后端 /api/yan/memories 互补，后端不可用时降级到本地
 */

const KEY_WORKING = 'yance:memory:working';
const KEY_FACTS = 'yance:memory:facts';
const KEY_EPISODES = 'yance:memory:episodes';
const KEY_SEMANTIC = 'yance:memory:semantic';

const FOLLOW_UP_DAYS = 30;        // 30 天后到期回访
const MAX_EPISODES = 50;          // 情景记忆上限
const MAX_FACTS = 30;             // 事实记忆上限

// ---------- 安全 JSON 读写 ----------

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function readArr(key) {
  if (typeof localStorage === 'undefined') return [];
  return safeParse(localStorage.getItem(key), []);
}

function writeArr(key, arr) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    console.warn('[memoryStore] 写入失败', key, e.message);
  }
}

// ---------- 关键词召回 ----------

/**
 * 简单关键词匹配：把 question 分词，与记忆 content 做包含匹配
 * @param {string} question
 * @param {string} content
 * @returns {number} 0-1 相关度
 */
function relevance(question, content) {
  if (!question || !content) return 0;
  const q = String(question);
  const c = String(content);
  // 抽取 2-4 字片段做匹配
  const tokens = new Set();
  for (let i = 0; i < q.length - 1; i++) {
    tokens.add(q.slice(i, i + 2));
    if (i + 3 <= q.length) tokens.add(q.slice(i, i + 3));
  }
  let hit = 0;
  let total = 0;
  for (const t of tokens) {
    total++;
    if (c.includes(t)) hit++;
  }
  return total === 0 ? 0 : hit / total;
}

// ---------- 公开 API ----------

/**
 * 召回与当前问题相关的记忆（跨 working/facts/episodes 三层）
 * @param {string} question 用户问题
 * @param {number} limit 最多返回条数
 * @returns {Array<{type: string, content: string, confidence: number, source: string, createdAt?: number}>}
 */
export function recallRelevantMemories(question, limit = 5) {
  if (!question) return [];
  const working = readArr(KEY_WORKING);
  const facts = readArr(KEY_FACTS);
  const episodes = readArr(KEY_EPISODES);

  const scored = [];

  for (const w of working) {
    const score = relevance(question, w.content);
    if (score > 0) scored.push({ ...w, type: 'working', confidence: 0.6 + score * 0.3 });
  }
  for (const f of facts) {
    const score = relevance(question, f.content);
    if (score > 0) scored.push({ ...f, type: 'fact', confidence: 0.7 + score * 0.2 });
  }
  for (const ep of episodes) {
    const score = relevance(question, ep.question || '');
    if (score > 0) scored.push({
      type: 'episode',
      content: `曾问「${ep.question}」→ 选了「${ep.decision}」(${ep.guaName || ep.hexagram || ''})${ep.outcome ? '，结局：' + ep.outcome : ''}`,
      confidence: 0.5 + score * 0.3,
      source: 'local',
      createdAt: ep.createdAt,
    });
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, limit);
}

/**
 * 把召回的记忆格式化为提示词上下文
 * @param {Array} memories recallRelevantMemories 的返回值
 * @returns {string}
 */
export function formatMemoriesForPrompt(memories) {
  if (!Array.isArray(memories) || memories.length === 0) return '';
  const lines = memories.map((m, i) => {
    const tag = { working: '近期', fact: '已知', episode: '曾历' }[m.type] || '记忆';
    return `${i + 1}. [${tag}] ${m.content}`;
  });
  return '【相关记忆】\n' + lines.join('\n');
}

/**
 * 保存工作记忆（当前会话上下文，短时）
 * @param {{content: string, [k: string]: any}} data
 */
export function saveWorkingMemory(data) {
  if (!data || !data.content) return;
  const arr = readArr(KEY_WORKING);
  arr.push({ ...data, createdAt: Date.now() });
  // 工作记忆只保留最近 10 条
  writeArr(KEY_WORKING, arr.slice(-10));
}

/**
 * 保存情景记忆（一次完整推演），并设置 30 天回访到期
 * @param {{question: string, decision: string, hexagram?: string, guaName?: string, agents?: string[], choice?: string}} data
 * @returns {object} 保存的 episode 对象
 */
export function saveEpisode(data) {
  if (!data || !data.question) return null;
  const arr = readArr(KEY_EPISODES);
  const now = Date.now();
  const episode = {
    id: `ep_${now}_${Math.random().toString(36).slice(2, 8)}`,
    question: data.question,
    decision: data.decision || '',
    hexagram: data.hexagram || '',
    guaName: data.guaName || '',
    agents: Array.isArray(data.agents) ? data.agents : [],
    choice: data.choice || '',
    createdAt: now,
    followUpDue: now + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000,
    outcome: null,
    outcomeStatus: null,   // positive / negative / neutral
    outcomeAt: null,
  };
  arr.unshift(episode);
  // 去重：同一问题 24 小时内只保留最新
  const dedup = [];
  const seen = new Map();
  for (const ep of arr) {
    const key = ep.question.slice(0, 20);
    const last = seen.get(key);
    if (last && (now - last.createdAt < 24 * 60 * 60 * 1000)) {
      continue; // 跳过 24h 内的重复
    }
    seen.set(key, ep);
    dedup.push(ep);
  }
  writeArr(KEY_EPISODES, dedup.slice(0, MAX_EPISODES));
  return episode;
}

/**
 * 从一次会话中推断事实记忆（简化版：基于关键词）
 * @param {{question: string, choice?: string, agents?: Array}} session
 * @returns {Array<{content: string, confidence: number}>}
 */
export function inferFactsFromSession(session) {
  if (!session || !session.question) return [];
  const facts = [];
  const q = session.question;

  // 简化规则：从问题里抽取倾向性事实
  if (/辞职|离职|跳槽/.test(q)) {
    facts.push({ content: '用户曾考虑职业变动', confidence: 0.7 });
  }
  if (/创业|开公司|all in/.test(q)) {
    facts.push({ content: '用户有创业倾向', confidence: 0.6 });
  }
  if (/买房|投资|理财/.test(q)) {
    facts.push({ content: '用户关注财务决策', confidence: 0.6 });
  }
  if (/感情|分手|结婚|恋爱/.test(q)) {
    facts.push({ content: '用户面临情感抉择', confidence: 0.6 });
  }

  // 保存到 facts 层（去重）
  if (facts.length > 0) {
    const arr = readArr(KEY_FACTS);
    for (const f of facts) {
      const exists = arr.some(x => x.content === f.content);
      if (!exists) {
        arr.push({ ...f, createdAt: Date.now() });
      }
    }
    writeArr(KEY_FACTS, arr.slice(-MAX_FACTS));
  }

  return facts;
}

/**
 * 获取到期待回访的情景记忆（30 天前保存且未回访）
 * @returns {Array} 到期的 episodes
 */
export function getPendingFollowUps() {
  const arr = readArr(KEY_EPISODES);
  const now = Date.now();
  return arr.filter(ep =>
    ep.followUpDue &&
    ep.followUpDue <= now &&
    !ep.outcome
  );
}

/**
 * 获取已回访的情景记忆（有 outcome 的），用于结局对照
 * @returns {Array} 已完成的 episodes，按 outcomeAt 倒序
 */
export function getCompletedFollowUps() {
  const arr = readArr(KEY_EPISODES);
  return arr
    .filter(ep => ep.outcome && ep.outcome.trim())
    .sort((a, b) => (b.outcomeAt || 0) - (a.outcomeAt || 0));
}

/**
 * 统计回顾准确率（卦象倾向 vs 实际结局状态）
 * @returns {{total, positive, negative, neutral, accuracy}}
 */
export function getFollowUpStats() {
  const arr = readArr(KEY_EPISODES);
  const completed = arr.filter(ep => ep.outcome);
  const total = completed.length;
  const positive = completed.filter(ep => ep.outcomeStatus === 'positive').length;
  const negative = completed.filter(ep => ep.outcomeStatus === 'negative').length;
  const neutral = completed.filter(ep => ep.outcomeStatus === 'neutral').length;
  // 准确率：正向卦象(乾/离/兑/震)对应positive算命中
  const positiveGuas = ['乾', '离', '兑', '震', '大有', '泰', '益', '升'];
  const hitCount = completed.filter(ep => {
    const isPositiveGua = positiveGuas.some(g => (ep.guaName || '').includes(g));
    return (isPositiveGua && ep.outcomeStatus === 'positive') || (!isPositiveGua && ep.outcomeStatus === 'negative');
  }).length;
  const accuracy = total > 0 ? Math.round((hitCount / total) * 100) : 0;
  return { total, positive, negative, neutral, accuracy };
}

/**
 * 更新情景记忆的结局（回访时填写实际结果）
 * @param {string} id episode id
 * @param {string} outcome 实际结局文本
 * @param {string} status positive / negative / neutral
 */
export function updateEpisodeOutcome(id, outcome, status) {
  if (!id) return;
  const arr = readArr(KEY_EPISODES);
  const idx = arr.findIndex(ep => ep.id === id);
  if (idx < 0) return;
  arr[idx] = {
    ...arr[idx],
    outcome: outcome || '',
    outcomeStatus: status || 'neutral',
    outcomeAt: Date.now(),
  };
  writeArr(KEY_EPISODES, arr);
}

/**
 * Agent 反馈存储（智囊调校迭代用）
 * 用户给发言点赞/踩，存入本地，下次发言时注入"你上次被赞/踩过XX"
 */
const KEY_FEEDBACK = 'yance:memory:agent_feedback';
const MAX_FEEDBACK = 100;

/**
 * 保存用户对某 Agent 发言的反馈
 * @param {string} agentId - Agent ID
 * @param {string} feedbackType - 'positive' | 'negative'
 * @param {string} question - 当前问题（用于上下文）
 * @param {string} dialogueText - 被反馈的发言内容（摘要）
 */
export function saveAgentFeedback(agentId, feedbackType, question = '', dialogueText = '') {
  if (!agentId || !feedbackType) return;
  const arr = readArr(KEY_FEEDBACK);
  arr.push({
    agentId,
    feedbackType,
    question: String(question).slice(0, 60),
    dialogue: String(dialogueText).slice(0, 60),
    createdAt: Date.now(),
  });
  writeArr(KEY_FEEDBACK, arr.slice(-MAX_FEEDBACK));
}

/**
 * 获取某 Agent 最近的反馈
 * @param {string} agentId
 * @param {number} limit
 * @returns {Array}
 */
export function getAgentFeedback(agentId, limit = 3) {
  if (!agentId) return [];
  const arr = readArr(KEY_FEEDBACK);
  return arr.filter(f => f.agentId === agentId).slice(-limit);
}

/**
 * 格式化某 Agent 的反馈摘要（供注入到 systemPrompt）
 * @param {string} agentId
 * @returns {string} 如 "你上次的发言被用户点赞（关于'要不要接offer'）"
 */
export function formatFeedbackForPrompt(agentId) {
  const feedbacks = getAgentFeedback(agentId, 2);
  if (feedbacks.length === 0) return '';
  const lines = feedbacks.map(f => {
    const tag = f.feedbackType === 'positive' ? '被点赞' : '被点踩';
    const ctx = f.question ? `（关于"${f.question}"）` : '';
    return `- 上次发言${tag}${ctx}`;
  });
  return `\n\n【用户对你历史发言的反馈】\n${lines.join('\n')}\n请据此微调：点赞的多做，点踩的少做。`;
}

/**
 * 检测用户历史选择模式（基于 episodes 的 decision 字段）
 * 用于演主动点出模式 - 用户连续选择稳定/机会倾向时，演主动提醒
 * @returns {{pattern: string|null, count: number, hint: string|null}}
 *   pattern: 'stable' | 'opportunity' | 'risk' | 'explore' | null
 *   count: 连续相同倾向的次数
 *   hint: 演的提醒文案（连续≥3次才有）
 */
export function detectChoicePattern() {
  try {
    const arr = readArr(KEY_EPISODES);
    if (arr.length < 2) return { pattern: null, count: 0, hint: null };

    // 取最近的选择（按 createdAt 倒序）
    const recent = arr
      .filter(ep => ep.decision)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map(ep => ep.decision);

    if (recent.length < 2) return { pattern: null, count: 0, hint: null };

    // 检测连续相同倾向
    const last = recent[0];
    let count = 1;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] === last) count++;
      else break;
    }

    const patternMap = {
      '稳守当前': 'stable',
      '抓住机会': 'opportunity',
      '规避风险': 'risk',
      '探索新路': 'explore',
    };
    const pattern = patternMap[last] || null;

    // 连续≥3次才有提醒
    let hint = null;
    if (count >= 3 && pattern) {
      const hints = {
        stable: `演观汝近${count}次皆择「稳守」。稳是根，但根不伸则枯。可有一事，是汝心知该动却未动的？`,
        opportunity: `演观汝近${count}次皆择「抓住机会」。进取是刃，但刃不收则卷。可有一事，是汝该缓却急的？`,
        risk: `演观汝近${count}次皆择「规避风险」。慎是盾，但盾不卸则疲。可有一险，是避了却心有不甘的？`,
        explore: `演观汝近${count}次皆择「探索新路」。行是足，但足不停则迷。可有一路，是汝该守却总想逃的？`,
      };
      hint = hints[pattern];
    }

    return { pattern, count, hint };
  } catch (e) {
    return { pattern: null, count: 0, hint: null };
  }
}

export default {
  recallRelevantMemories,
  formatMemoriesForPrompt,
  saveWorkingMemory,
  saveEpisode,
  inferFactsFromSession,
  getPendingFollowUps,
  getCompletedFollowUps,
  getFollowUpStats,
  updateEpisodeOutcome,
  saveAgentFeedback,
  detectChoicePattern,
  getAgentFeedback,
  formatFeedbackForPrompt,
};
