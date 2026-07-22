import { query, useMemory } from './db.js';

const TABLE = 'inference_sessions';

// 创建推演会话
export async function createSession(userId, question) {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await query({
    table: TABLE,
    action: 'insert',
    data: {
      id,
      user_id: userId,
      question,
      status: 'active',
      phase: 'input',
      dialogue_history: '{}',
      agent_ids: '',
      options: '[]',
    },
  });
  return { id, userId, question, status: 'active', phase: 'input', dialogueHistory: {}, agentIds: [], options: [] };
}

// 获取会话
export async function getSession(sessionId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { id: sessionId },
  });
  if (!result.rows || result.rows.length === 0) return null;
  return parseSessionRow(result.rows[0]);
}

// 更新会话
export async function updateSession(sessionId, updates) {
  const data = {};

  const fieldMap = {
    status: 'status',
    phase: 'phase',
    currentAgentIdx: 'current_agent_idx',
    analysis: 'analysis',
    reasoning: 'reasoning',
    summary: 'summary',
    commitText: 'commit_text',
  };

  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key]) {
      data[fieldMap[key]] = value;
    } else if (key === 'agentIds') {
      data.agent_ids = Array.isArray(value) ? value.join(',') : value;
    } else if (key === 'dialogueHistory') {
      data.dialogue_history = typeof value === 'string' ? value : JSON.stringify(value);
    } else if (key === 'options') {
      data.options = typeof value === 'string' ? value : JSON.stringify(value);
    } else if (key === 'divinationResult') {
      data.divination_result = typeof value === 'string' ? value : JSON.stringify(value);
    } else if (key === 'selectedChoice') {
      data.selected_choice = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }

  if (Object.keys(data).length === 0) return null;

  await query({
    table: TABLE,
    action: 'update',
    id: sessionId,
    data,
  });

  return getSession(sessionId);
}

// 添加对话记录
export async function addDialogue(sessionId, agentId, speaker, text) {
  const session = await getSession(sessionId);
  if (!session) return null;

  const history = session.dialogueHistory || {};
  if (!history[agentId]) history[agentId] = [];

  history[agentId].push({
    speaker, // 'agent' | 'user'
    text,
    timestamp: new Date().toISOString(),
  });

  return updateSession(sessionId, { dialogueHistory: history });
}

// 获取用户的活跃会话
export async function getActiveSessions(userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId, status: 'active' },
    queryOptions: { orderBy: 'updated_at:desc', limit: 5 },
  });
  return (result.rows || []).map(parseSessionRow);
}

// 获取用户的会话历史
export async function getSessionHistory(userId, limit = 20) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { orderBy: 'updated_at:desc', limit },
  });
  return (result.rows || []).map(parseSessionRow);
}

// 标记会话为已完成
export async function completeSession(sessionId) {
  return updateSession(sessionId, { status: 'completed' });
}

// 标记过期会话
export async function abandonOldSessions() {
  if (useMemory) {
    // 内存模式：手动查找并更新过期的活跃会话
    const result = await query({
      table: TABLE,
      action: 'select',
      filter: { status: 'active' },
    });
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const row of result.rows || []) {
      const updatedAt = new Date(row.updated_at).getTime();
      if (now - updatedAt > dayMs) {
        await query({
          table: TABLE,
          action: 'update',
          id: row.id,
          data: { status: 'abandoned' },
        });
      }
    }
  } else {
    // PostgreSQL 模式：直接执行 SQL
    await query({
      sql: `UPDATE inference_sessions SET status = 'abandoned', updated_at = NOW() WHERE status = 'active' AND updated_at < NOW() - INTERVAL '24 hours'`,
      params: [],
    });
  }
}

function parseSessionRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    question: row.question,
    status: row.status,
    phase: row.phase,
    agentIds: row.agent_ids ? row.agent_ids.split(',').filter(Boolean) : [],
    currentAgentIdx: row.current_agent_idx,
    dialogueHistory: typeof row.dialogue_history === 'string' ? JSON.parse(row.dialogue_history || '{}') : (row.dialogue_history || {}),
    analysis: row.analysis,
    reasoning: row.reasoning,
    summary: row.summary,
    options: typeof row.options === 'string' ? JSON.parse(row.options || '[]') : (row.options || []),
    divinationResult: typeof row.divination_result === 'string' ? JSON.parse(row.divination_result || 'null') : row.divination_result,
    selectedChoice: typeof row.selected_choice === 'string' ? JSON.parse(row.selected_choice || 'null') : row.selected_choice,
    commitText: row.commit_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default {
  createSession,
  getSession,
  updateSession,
  addDialogue,
  getActiveSessions,
  getSessionHistory,
  completeSession,
  abandonOldSessions,
};
