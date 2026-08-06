/**
 * Event Store — Event Sourcing 内核（v3.0）
 *
 * 核心思想：
 * - 事件即真相，状态是事件的投影
 * - 事件追加是原子 INSERT（db.js 的 insert 天然原子），不需要额外事务
 * - 状态读取 = 最新快照 + 重放后续事件
 *
 * 设计依据: docs/specs/2026-08-01-industrial-v3-design.md 第5节
 * 解决问题: db.js 无事务导致状态与事件脱节（deepseek 死穴1）
 */

import { query } from './db.js';
import { generateUUID } from '../utils/id.js';
import logger from './logger.js';

const EVENTS_TABLE = 'deliberation_events';
const SNAPSHOTS_TABLE = 'deliberation_snapshots';

// 每多少个事件写一次快照（平衡恢复速度与写入开销）
const SNAPSHOT_INTERVAL = 10;

/**
 * 追加事件（原子操作）
 * 单条 INSERT，PG 和内存模式都天然原子
 * @param {string} sessionId
 * @param {string} type 事件类型
 * @param {object} data 事件数据
 * @param {string|null} actor
 * @returns {Promise<object>} 完整事件对象
 */
export async function appendEvent(sessionId, type, data = {}, actor = null) {
  const id = generateUUID();
  const timestamp = new Date().toISOString();
  await query({
    table: EVENTS_TABLE,
    action: 'insert',
    data: {
      id,
      session_id: sessionId,
      type,
      payload: JSON.stringify(data),
      actor,
    },
  });
  return { id, sessionId, type, data, actor, timestamp };
}

/**
 * 读取 session 的所有事件（按时间正序）
 * @param {string} sessionId
 * @param {string|null} afterTimestamp 只读此时间之后的事件
 * @returns {Promise<Array>}
 */
export async function getEvents(sessionId, afterTimestamp = null) {
  const result = await query({
    table: EVENTS_TABLE,
    action: 'select',
    filter: { session_id: sessionId },
    queryOptions: { orderBy: 'created_at:asc', limit: 200 },
  });
  let events = result.rows || [];
  if (afterTimestamp) {
    const after = new Date(afterTimestamp).getTime();
    events = events.filter((e) => {
      const t = new Date(e.created_at).getTime();
      return t > after;
    });
  }
  return events.map((row) => ({
    id: row.id,
    type: row.type,
    sessionId: row.session_id,
    data: typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {}),
    actor: row.actor,
    timestamp: row.created_at,
  }));
}

/**
 * 保存快照（原子 INSERT）
 * @param {string} sessionId
 * @param {number} version 快照时的已应用事件数
 * @param {object} state 完整状态投影
 */
export async function saveSnapshot(sessionId, version, state) {
  const id = generateUUID();
  await query({
    table: SNAPSHOTS_TABLE,
    action: 'insert',
    data: {
      id,
      session_id: sessionId,
      version,
      state: JSON.stringify(state),
    },
  });
  logger.info('[EventStore] 快照已保存', { sessionId, version });
}

/**
 * 读最新快照
 * @param {string} sessionId
 * @returns {Promise<{version, state, createdAt}|null>}
 */
export async function getLatestSnapshot(sessionId) {
  const result = await query({
    table: SNAPSHOTS_TABLE,
    action: 'select',
    filter: { session_id: sessionId },
    queryOptions: { orderBy: 'version:desc', limit: 1 },
  });
  if (!result.rows || result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    version: row.version,
    state: typeof row.state === 'string' ? JSON.parse(row.state || '{}') : (row.state || {}),
    createdAt: row.created_at,
  };
}

/**
 * 应用单个事件到状态（投影函数）
 * 纯函数：修改 state 对象并返回
 * @param {object} state 可变状态对象
 * @param {object} event 事件
 */
export function applyEvent(state, event) {
  const d = event.data || {};
  switch (event.type) {
    case 'SESSION_STARTED':
      state.state = 'PLAN';
      state.question = d.question;
      state.userId = d.userId;
      state.advisorPool = d.advisorPool || [];
      state.findings = [];
      state.toolResults = [];
      state.dialogue = [];
      state.replanCount = 0;
      break;
    case 'PLAN_DONE':
      state.state = d.needClarify ? 'CLARIFY' : 'DELIBERATE';
      state.plan = d.plan;
      state.questionType = d.questionType;
      state.askUser = d.needClarify ? d.askUser : null;
      break;
    case 'CLARIFY_ASKED':
      state.state = 'WAIT';
      state.askUser = d.questions;
      break;
    case 'CLARIFY_ANSWERED':
      state.state = 'DELIBERATE';
      state.answers = d.answers;
      state.questionContext = d.questionContext;
      delete state.askUser;
      break;
    case 'REACT_THINK':
      state.state = 'DELIBERATE';
      if (!state.dialogue) state.dialogue = [];
      state.dialogue.push({ role: 'think', content: d.thought, round: d.round });
      break;
    case 'REACT_ACT':
      state.dialogue.push({ role: 'act', action: d.action, args: d.args, round: d.round });
      break;
    case 'REACT_OBSERVE':
      state.dialogue.push({ role: 'observe', content: d.observation, round: d.round });
      if (d.toolResult) {
        if (!state.toolResults) state.toolResults = [];
        state.toolResults.push(d.toolResult);
      }
      if (d.advisorFinding) {
        if (!state.findings) state.findings = [];
        state.findings.push(d.advisorFinding);
      }
      break;
    case 'ADVISOR_SPEAK':
      if (!state.findings) state.findings = [];
      state.findings.push({
        agentId: d.agentId,
        agentName: d.agentName,
        content: d.content,
        stance: d.stance,
        perspective: d.perspective,
      });
      break;
    case 'REFLECT_DONE':
      state.state = 'ORACLE';
      state.conflicts = d.conflicts;
      state.gaps = d.gaps;
      break;
    case 'ORACLE_SET':
      state.state = 'COMMIT';
      state.oracle = d.oracle;
      break;
    case 'COMMITTED':
      state.state = 'DONE';
      state.choice = d.choice;
      break;
    case 'PAUSED':
      state.pausedState = state.state;
      state.state = 'PAUSED';
      state.pausedAt = d.pausedAt;
      state.pauseReason = d.reason;
      break;
    case 'RESUMED':
      state.state = d.resumeTo || state.pausedState || 'DELIBERATE';
      delete state.pausedAt;
      delete state.pauseReason;
      break;
    case 'FAILED':
      state.state = 'FAILED';
      state.failReason = d.reason;
      break;
    default:
      logger.warn('[EventStore] 未知事件类型', { type: event.type });
  }
}

/**
 * 加载状态：最新快照 + 重放后续事件
 * 这是 Event Sourcing 的核心恢复逻辑
 * @param {string} sessionId
 * @returns {Promise<object>} 完整状态对象（含 version 字段）
 */
export async function loadState(sessionId) {
  const snapshot = await getLatestSnapshot(sessionId);

  let state = {
    sessionId,
    state: 'INIT',
    question: null,
    userId: null,
    advisorPool: [],
    findings: [],
    toolResults: [],
    dialogue: [],
    plan: null,
    oracle: null,
    replanCount: 0,
    version: 0,
  };
  let version = 0;
  let afterTs = null;

  if (snapshot) {
    state = { ...state, ...snapshot.state };
    version = snapshot.version;
    afterTs = snapshot.createdAt;
  }

  const events = await getEvents(sessionId, afterTs);
  for (const evt of events) {
    applyEvent(state, evt);
    version++;
  }

  state.version = version;
  return state;
}

/**
 * 追加事件 + 自动判断是否写快照
 * @param {string} sessionId
 * @param {string} type
 * @param {object} data
 * @param {string|null} actor
 * @param {object} currentState 当前状态对象（用于写快照）
 * @param {number} currentVersion 当前版本号
 * @returns {Promise<object>} 事件对象
 */
export async function appendWithSnapshot(sessionId, type, data, actor, currentState, currentVersion) {
  const evt = await appendEvent(sessionId, type, data, actor);
  const newVersion = currentVersion + 1;
  // 每隔 SNAPSHOT_INTERVAL 或状态切换时写快照
  const isStateChange = type === 'SESSION_STARTED' || type === 'PLAN_DONE' ||
    type === 'CLARIFY_ANSWERED' || type === 'REFLECT_DONE' || type === 'ORACLE_SET' ||
    type === 'COMMITTED' || type === 'FAILED';
  if (newVersion % SNAPSHOT_INTERVAL === 0 || isStateChange) {
    await saveSnapshot(sessionId, newVersion, currentState);
  }
  return evt;
}

export default {
  appendEvent,
  appendWithSnapshot,
  getEvents,
  saveSnapshot,
  getLatestSnapshot,
  applyEvent,
  loadState,
};
