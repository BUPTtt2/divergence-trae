/**
 * 真 Agent 架构 Step 1: 三层记忆系统
 *
 * L1 工作记忆  → deliberation_sessions（单次推演载体，由 saveSession/getSession 管理）
 * L2 会话记忆  → session_summaries（近 7 天推演摘要，recentSummaries 读 / consolidate 写）
 * L3 长期命格  → user_memory（recall 向量检索 / upsertMemory 合并写入）
 *
 * 设计要点:
 * - 全部走 db.js 的 query 接口（PG + 内存双模式兼容）
 * - embedding 用关键词 TF 哈希到固定维度数组，存 TEXT（JSON 字符串），无新依赖
 * - recall 用余弦相似度 + 关键词匹配兜底，按 importance × recency × frequency 加权
 * - consolidate 走 llmRouter.callLLM 做摘要与命格提取，失败有降级
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 4.2 / 8.1 节
 */

import { query } from './db.js';
import { callLLM } from './llmRouter.js';
import { generateUUID } from '../utils/id.js';
import logger from './logger.js';

// ============ 常量 ============
const SESSIONS_TABLE = 'deliberation_sessions';
const SUMMARIES_TABLE = 'session_summaries';
const MEMORY_TABLE = 'user_memory';

const EMBED_DIM = 256;
const MERGE_THRESHOLD = 0.85; // L3 合并阈值
const DAY_MS = 24 * 60 * 60 * 1000;

// 分词停用词（中文虚词 + 英文常见词）
const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '和', '与', '或',
  '也', '都', '就', '这', '那', '有', '不', '为', '上', '下', '中', '大', '小',
  '人', '个', '到', '会', '可', '以', '要', '想', '把', '被', '让', '给', '对',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'but', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'do', 'does',
]);

// ============ 向量工具：TF 哈希（无依赖） ============

/**
 * 简易分词：latin/digit 连续串 + 单个 CJK 字符，过滤停用词
 */
function tokenize(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const tokens = [];
  const latin = lower.match(/[a-z0-9]+/g) || [];
  tokens.push(...latin);
  const cjk = lower.match(/[\u4e00-\u9fff]/g) || [];
  tokens.push(...cjk);
  return tokens.filter((t) => t && !STOPWORDS.has(t));
}

/**
 * 字符串 → 32 位正整数哈希（确定性）
 */
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * 文本 → 固定维度 TF 向量（L2 归一化）
 */
function embed(text) {
  const tokens = tokenize(text);
  const vec = new Array(EMBED_DIM).fill(0);
  for (const t of tokens) {
    vec[hashStr(t) % EMBED_DIM] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;
  }
  return vec;
}

/**
 * 余弦相似度（向量已归一化时等于点积，这里保留通式以兼容未归一化向量）
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 解析存储中的 embedding（TEXT → number[]）
 */
function parseEmbedding(embedding) {
  if (Array.isArray(embedding)) return embedding;
  if (typeof embedding === 'string' && embedding) {
    try {
      const arr = JSON.parse(embedding);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* ignore */
    }
  }
  return [];
}

/**
 * 解析 LLM 返回的记忆 JSON 数组（容错）
 */
function parseMemoriesJSON(text) {
  if (!text) return [];
  const tryArr = (s) => {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.filter((m) => m && m.content);
    } catch {
      /* ignore */
    }
    return null;
  };
  const direct = tryArr(text);
  if (direct) return direct;
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    const extracted = tryArr(m[0]);
    if (extracted) return extracted;
  }
  return [];
}

/**
 * 去掉 data 中值为 undefined 的字段（避免 update 时把列置 NULL）
 */
function dropUndefined(data) {
  const out = { ...data };
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

// ============ L1: 推演会话 ============

/**
 * 保存/更新推演会话（L1 工作记忆载体）
 * @param {object} session { id?, user_id, question, plan, state, tool_results, findings, oracle, memory_used, replan_count }
 * @returns {Promise<object>} 带 id 的 session
 */
export async function saveSession(session) {
  const id = session.id || `sess_${generateUUID()}`;
  const existing = await getSession(id);
  const data = dropUndefined({
    user_id: session.user_id,
    question: session.question,
    plan: session.plan,
    state: session.state || 'PLAN',
    tool_results: session.tool_results,
    findings: session.findings,
    oracle: session.oracle,
    memory_used: session.memory_used,
    replan_count: session.replan_count ?? 0,
  });

  if (existing) {
    await query({ table: SESSIONS_TABLE, action: 'update', id, data });
    logger.info('会话已更新', { sessionId: id, state: data.state });
  } else {
    data.id = id;
    await query({ table: SESSIONS_TABLE, action: 'insert', data });
    logger.info('会话已创建', { sessionId: id, state: data.state, userId: data.user_id });
  }
  return { ...session, id };
}

/**
 * 读取推演会话
 */
export async function getSession(sessionId) {
  const result = await query({
    table: SESSIONS_TABLE,
    action: 'select',
    filter: { id: sessionId },
  });
  return result.rows[0] || null;
}

/**
 * 更新会话状态（及任意 patch 字段）
 * @param {string} sessionId
 * @param {string} state 新状态 PLAN/WAIT/EXECUTE/REFLECT/ORACLE/COMMIT
 * @param {object} patch 额外要更新的字段
 */
export async function updateSessionState(sessionId, state, patch = {}) {
  const data = dropUndefined({ state, ...patch });
  await query({ table: SESSIONS_TABLE, action: 'update', id: sessionId, data });
  logger.info('会话状态变更', { sessionId, state, patchKeys: Object.keys(patch) });
  return getSession(sessionId);
}

// ============ L2: 会话摘要 ============

/**
 * 读取近 N 天会话摘要（L2）
 */
export async function recentSummaries(userId, days = 7) {
  const result = await query({
    table: SUMMARIES_TABLE,
    action: 'select',
    filter: { user_id: userId },
  });
  const cutoff = Date.now() - days * DAY_MS;
  return result.rows
    .filter((s) => {
      const created = new Date(s.created_at).getTime();
      if (Number.isNaN(created)) return true; // 时间解析失败则保留
      return created >= cutoff;
    })
    .filter((s) => !s.expires_at || Number(s.expires_at) > Date.now())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ============ L3: 长期命格 ============

/**
 * 召回与问题最相关的 topN 条 L3 命格
 * 检索：余弦相似度 + 关键词匹配兜底
 * 排序：similarity × importance × recency × frequency
 */
export async function recall(userId, question, topN = 5) {
  const result = await query({
    table: MEMORY_TABLE,
    action: 'select',
    filter: { user_id: userId },
  });
  if (result.rows.length === 0) return [];

  const qVec = embed(question);
  const qTokens = new Set(tokenize(question));
  const now = Date.now();

  const scored = result.rows.map((m) => {
    const emb = parseEmbedding(m.embedding);
    let score = cosineSimilarity(qVec, emb);

    // 关键词匹配兜底：当向量相似度低时，用 token 重叠补一个保底分
    if (score < 0.1) {
      const mTokens = tokenize(m.content);
      const overlap = mTokens.filter((t) => qTokens.has(t)).length;
      if (overlap > 0 && qTokens.size > 0) {
        score = Math.max(score, (overlap / qTokens.size) * 0.4);
      }
    }

    // importance: 1-5 → 0.6-1.2
    const impWeight = 0.6 + ((m.importance || 3) / 5) * 0.6;
    // recency: 越久远权重越低，30 天半衰
    const lastAcc = m.last_accessed_at ? Number(m.last_accessed_at) : new Date(m.created_at).getTime();
    const daysOld = Number.isNaN(lastAcc) ? 0 : Math.max(0, (now - lastAcc) / DAY_MS);
    const recency = 1 / (1 + daysOld / 30);
    // frequency: log 衰减
    const freq = 1 + Math.log10((m.access_count || 1) + 1) / 3;

    return { memory: m, score: score * impWeight * recency * freq };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN).filter((s) => s.score > 0);

  // 命中记忆异步更新访问时间（不阻塞召回）
  for (const s of top) {
    query({
      table: MEMORY_TABLE,
      action: 'update',
      id: s.memory.id,
      data: {
        last_accessed_at: now,
        access_count: (s.memory.access_count || 1) + 1,
      },
    }).catch((e) => logger.warn('recall 访问计数更新失败', { id: s.memory.id, error: e.message }));
  }

  logger.info('L3 召回完成', { userId, total: result.rows.length, hit: top.length });
  return top.map((s) => s.memory);
}

/**
 * 把记忆格式化为可注入智囊 prompt 的字符串片段
 * @param {Array} memories recall 返回的记忆数组
 * @returns {string}
 */
export function injectToAgent(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map((m, i) => {
    const tag = m.memory_type || '记忆';
    const imp = m.importance ? `·重要度${m.importance}` : '';
    return `${i + 1}. [${tag}${imp}] ${m.content}`;
  });
  return [
    '【演之命格簿·用户记忆】',
    lines.join('\n'),
    '（以上为演所记用户命格，可在发言中自然引用，切勿生硬复述）',
  ].join('\n');
}

/**
 * 写/更新 L3 命格：与已有记忆向量比对，相似度 > 0.85 合并，否则新增
 * @param {object} memory { user_id, memory_type, content, embedding?, importance?, source_session_id?, id? }
 * @returns {Promise<{memory: object, action: 'merged'|'created', similarity?: number}>}
 */
export async function upsertMemory(memory) {
  const userId = memory.user_id;
  if (!userId) throw new Error('upsertMemory 缺少 user_id');
  const content = memory.content || '';

  // 归一化 embedding 为数组
  let embedding = memory.embedding;
  if (typeof embedding === 'string') embedding = parseEmbedding(embedding);
  if (!Array.isArray(embedding) || embedding.length === 0) embedding = embed(content);
  const embeddingStr = JSON.stringify(embedding);

  // 在已有记忆中找最相似的一条
  const existing = await query({
    table: MEMORY_TABLE,
    action: 'select',
    filter: { user_id: userId },
  });
  let best = null;
  let bestSim = 0;
  for (const m of existing.rows) {
    const sim = cosineSimilarity(embedding, parseEmbedding(m.embedding));
    if (sim > bestSim) {
      bestSim = sim;
      best = m;
    }
  }

  if (best && bestSim > MERGE_THRESHOLD) {
    // 合并：内容若差异显著则拼接，重要度+1（封顶5），访问计数+1
    const mergedContent =
      best.content && content && !best.content.includes(content)
        ? `${best.content}；${content}`
        : content || best.content;
    const data = dropUndefined({
      content: mergedContent,
      embedding: embeddingStr,
      importance: Math.min(5, (best.importance || 3) + 1),
      last_accessed_at: Date.now(),
      access_count: (best.access_count || 1) + 1,
    });
    await query({ table: MEMORY_TABLE, action: 'update', id: best.id, data });
    logger.info('L3 记忆合并', { id: best.id, sim: bestSim.toFixed(3), userId });
    return { memory: { ...best, ...data }, action: 'merged', similarity: bestSim };
  }

  // 新增
  const id = memory.id || `mem_${generateUUID()}`;
  const data = dropUndefined({
    id,
    user_id: userId,
    memory_type: memory.memory_type || 'concern',
    content,
    embedding: embeddingStr,
    importance: memory.importance ?? 3,
    last_accessed_at: Date.now(),
    access_count: 1,
    source_session_id: memory.source_session_id || null,
  });
  await query({ table: MEMORY_TABLE, action: 'insert', data });
  logger.info('L3 记忆新增', { id, type: data.memory_type, userId });
  return { memory: data, action: 'created' };
}

// ============ Reflect: 记忆固化 ============

/**
 * Reflect 阶段调用：从会话提炼 L2 摘要 + L3 命格
 * 流程: 加载会话 → LLM 摘要写 L2 → LLM 提取命格写 L3 → 会话状态置 COMMIT
 */
export async function consolidate(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    logger.warn('consolidate: 会话不存在', { sessionId });
    return null;
  }
  logger.info('开始记忆固化', { sessionId, userId: session.user_id });

  // 组装上下文
  const findings = Array.isArray(session.findings) ? session.findings : [];
  const findingsText = findings
    .map((f) => (typeof f === 'string' ? f : f.content || f.summary || JSON.stringify(f)))
    .join('\n');
  const oracleText = session.oracle
    ? typeof session.oracle === 'string'
      ? session.oracle
      : JSON.stringify(session.oracle)
    : '';
  const context = [
    `用户问题: ${session.question || ''}`,
    `智囊发现:`,
    findingsText || '（无）',
    `卦象/结论: ${oracleText || '（无）'}`,
  ].join('\n');

  // L1 → L2 摘要
  let summary = null;
  try {
    summary = await callLLM(
      [
        {
          role: 'system',
          content:
            '你是演，一位赛博推演师。请把本次推演浓缩为2-3句话摘要，突出用户问题、关键发现与最终倾向。直接输出摘要正文，不要额外解释。',
        },
        { role: 'user', content: context },
      ],
      { maxTokens: 200, temperature: 0.6 },
    );
  } catch (e) {
    logger.warn('LLM 摘要失败，降级拼接', { error: e.message });
  }
  if (!summary) {
    summary = `${session.question || ''} → ${(findingsText || oracleText).slice(0, 120)}`;
  }

  // 写 L2
  const summaryId = `sum_${generateUUID()}`;
  await query({
    table: SUMMARIES_TABLE,
    action: 'insert',
    data: {
      id: summaryId,
      user_id: session.user_id,
      session_id: sessionId,
      summary,
      question: session.question || '',
      choice: session.choice || null,
      expires_at: Date.now() + 7 * DAY_MS,
    },
  });
  logger.info('L2 摘要已存', { summaryId, sessionId });

  // L2 → L3 命格提取
  let extracted = [];
  try {
    const raw = await callLLM(
      [
        {
          role: 'system',
          content:
            '从以下推演记录中提取用户的长期命格（偏好/性格/历史决策/曾虑之事）。只返回 JSON 数组，每个元素形如 {"memory_type":"concern|preference|personality|decision|skill","content":"...","importance":1到5的整数}。无可提取项则返回 []。',
        },
        { role: 'user', content: `${context}\n摘要: ${summary}` },
      ],
      { maxTokens: 300, temperature: 0.4 },
    );
    extracted = parseMemoriesJSON(raw);
  } catch (e) {
    logger.warn('LLM 命格提取失败，跳过 L3', { error: e.message });
  }

  let upserted = 0;
  for (const m of extracted) {
    try {
      await upsertMemory({
        user_id: session.user_id,
        memory_type: m.memory_type || 'concern',
        content: m.content,
        importance: m.importance || 3,
        source_session_id: sessionId,
      });
      upserted++;
    } catch (e) {
      logger.warn('L3 upsert 失败', { error: e.message, content: m.content });
    }
  }
  logger.info('记忆固化完成', { sessionId, l3_count: upserted });

  // 会话状态置 COMMIT
  await updateSessionState(sessionId, 'COMMIT');
  return { summary, summaryId, newMemories: upserted };
}

// ============ 自检 ============

/**
 * 自检：upsert 一条"用户曾虑高原反应"，recall 同主题问题应能检索到
 * 跑法: node --input-type=module -e "import('./src/services/memoryService.js').then(m=>m.selfTest())"
 *       （需在 server 目录、且 db.js 已 initDB；内存模式即可）
 */
export async function selfTest() {
  const userId = `selftest_${Date.now()}`;
  logger.info('=== memoryService selfTest 开始 ===', { userId });

  await upsertMemory({
    user_id: userId,
    memory_type: 'concern',
    content: '用户曾虑高原反应',
    importance: 4,
  });

  const hits = await recall(userId, '高原反应要不要去西藏', 5);
  const ok = hits.length > 0 && hits.some((m) => (m.content || '').includes('高原反应'));

  logger.info('=== memoryService selfTest 结果 ===', {
    ok,
    hitCount: hits.length,
    top: hits[0]?.content,
  });

  if (!ok) {
    throw new Error('selfTest 失败：未检索到刚写入的高原反应记忆');
  }
  return { ok, hitCount: hits.length, top: hits[0]?.content };
}

export default {
  recall,
  recentSummaries,
  injectToAgent,
  upsertMemory,
  consolidate,
  saveSession,
  getSession,
  updateSessionState,
  selfTest,
};
