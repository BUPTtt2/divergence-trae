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

import { createHash } from 'node:crypto';

import { query } from './db.js';
import { generateUUID } from '../utils/id.js';
import logger from './logger.js';

const EVENTS_TABLE = 'deliberation_events';
const SNAPSHOTS_TABLE = 'deliberation_snapshots';

export const AGENT_EVENT_SCHEMA_VERSION = 1;
export const AGENT_EVENT_VISIBILITIES = Object.freeze(['public', 'summary', 'internal']);
export const AGENT_DOMAIN_EVENT_TYPES = Object.freeze([
  'SESSION_CREATED', 'PLANNING_STARTED',
  'PLAN_CREATED', 'PLAN_REVISED', 'UNKNOWN_IDENTIFIED',
  'AGENT_ASSIGNED', 'AGENT_STARTED', 'AGENT_COMPLETED', 'AGENT_FAILED',
  'TOOL_STARTED', 'EVIDENCE_ACCEPTED', 'EVIDENCE_REJECTED', 'ACTION_FAILED',
  'CLAIM_CHALLENGED', 'CONSENSUS_FORMED', 'AUDIT_FAILED',
  'APPROVAL_REQUIRED', 'DECISION_COMMITTED', 'SESSION_COMPLETED',
  'LENS_SELECTED', 'LENS_TASK_CREATED', 'LENS_TASK_COMPLETED', 'LENS_REVIEW_COMPLETED',
]);

export function deterministicEventId(sessionId, correlationId, type, idempotencyKey) {
  const digest = createHash('sha256')
    .update(JSON.stringify([sessionId, correlationId, type, idempotencyKey]))
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(12, 15)}-8${digest.slice(15, 18)}-${digest.slice(18, 30)}`;
}

const APPEND_OUTCOME = Symbol('agentEventAppendOutcome');

export function wasEventInserted(event) {
  return event?.[APPEND_OUTCOME] === true;
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`;
}

function withAppendOutcome(event, inserted) {
  Object.defineProperty(event, APPEND_OUTCOME, { value: inserted });
  return event;
}

function assertMatchingEventIdentity(existing, identity) {
  const mismatches = [];
  if (existing.sessionId !== identity.sessionId) mismatches.push('sessionId');
  if (existing.type !== identity.type) mismatches.push('type');
  if (existing.actorId !== identity.actorId) mismatches.push('actorId');
  if ((existing.taskId || null) !== identity.taskId) mismatches.push('taskId');
  if ((existing.causationId || null) !== identity.causationId) mismatches.push('causationId');
  if (existing.correlationId !== identity.correlationId) mismatches.push('correlationId');
  if (existing.visibility !== identity.visibility) mismatches.push('visibility');
  if (existing.schemaVersion !== AGENT_EVENT_SCHEMA_VERSION) mismatches.push('schemaVersion');
  if (stableSerialize(existing.payload) !== stableSerialize(identity.payload)) mismatches.push('payload');
  if (mismatches.length > 0) {
    const error = new Error(`EVENT_ID_COLLISION: existing event differs by ${mismatches.join(', ')}`);
    error.code = 'EVENT_ID_COLLISION';
    throw error;
  }
}

function replayExistingEvent(row, identity) {
  const existing = rowToAgentEvent(row, 1);
  assertMatchingEventIdentity(existing, identity);
  return withAppendOutcome(existing, false);
}

const INTERNAL_BY_DEFAULT = new Set(['THOUGHT', 'ACTION', 'REACT_THINK', 'REACT_ACT', 'REACT_OBSERVE', 'AUDIT_EVENT']);
const SUMMARY_BY_DEFAULT = new Set(['OBSERVATION', 'ERROR', 'AUDIT_ALERT']);
const appendQueues = new Map();
const MAX_SEQUENCE_RETRIES = 5;

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
export async function appendEvent(sessionId, type, data = {}, actor = null, metadata = {}) {
  if (!sessionId || !type) throw new TypeError('appendEvent requires sessionId and type');
  const previous = appendQueues.get(sessionId) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const eventId = metadata.eventId || generateUUID();
    const payload = data && typeof data === 'object' ? data : {};
    const identity = {
      sessionId,
      type,
      actorId: metadata.actorId || actor || 'system',
      taskId: metadata.taskId || null,
      causationId: metadata.causationId || null,
      correlationId: metadata.correlationId || payload.correlationId || `corr_${eventId}`,
      payload,
      visibility: normalizeVisibility(metadata.visibility, type),
    };
    const existing = await query({
      table: EVENTS_TABLE,
      action: 'select',
      filter: { id: eventId },
      queryOptions: { limit: 1 },
    });
    if (existing.rows?.[0]) return replayExistingEvent(existing.rows[0], identity);
    const createdAt = metadata.createdAt || new Date().toISOString();
    for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt += 1) {
      const latest = await query({
        table: EVENTS_TABLE,
        action: 'select',
        filter: { session_id: sessionId },
        queryOptions: { orderBy: 'sequence:desc', limit: 1 },
      });
      const sequence = Number(latest.rows?.[0]?.sequence || 0) + 1;
      const event = withLegacyAliases({
        eventId,
        sessionId,
        sequence,
        type,
        actorId: identity.actorId,
        ...(identity.taskId ? { taskId: identity.taskId } : {}),
        ...(identity.causationId ? { causationId: identity.causationId } : {}),
        correlationId: identity.correlationId,
        payload: identity.payload,
        visibility: identity.visibility,
        createdAt,
        schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      });
      try {
        await query({
          table: EVENTS_TABLE,
          action: 'insert',
          data: {
            id: event.eventId,
            session_id: event.sessionId,
            sequence: event.sequence,
            type: event.type,
            payload: JSON.stringify(event.payload),
            actor: event.actorId,
            actor_id: event.actorId,
            task_id: event.taskId || null,
            causation_id: event.causationId || null,
            correlation_id: event.correlationId,
            visibility: event.visibility,
            schema_version: event.schemaVersion,
            created_at: event.createdAt,
          },
        });
        return withAppendOutcome(event, true);
      } catch (error) {
        if (isEventIdConflict(error)) {
          const existingEvent = await query({
            table: EVENTS_TABLE,
            action: 'select',
            filter: { id: eventId },
            queryOptions: { limit: 1 },
          });
          if (existingEvent.rows?.[0]) return replayExistingEvent(existingEvent.rows[0], identity);
        }
        if (!isSequenceConflict(error) || attempt === MAX_SEQUENCE_RETRIES - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, (2 ** attempt) + Math.floor(Math.random() * 5)));
      }
    }
    throw new Error('Agent event sequence allocation exhausted');
  });
  appendQueues.set(sessionId, operation);
  try {
    return await operation;
  } finally {
    if (appendQueues.get(sessionId) === operation) appendQueues.delete(sessionId);
  }
}

export function isSequenceConflict(error) {
  return error?.code === '23505' && error?.constraint === 'idx_events_session_sequence';
}

function isEventIdConflict(error) {
  return error?.code === '23505' && error?.constraint === 'deliberation_events_pkey';
}

/**
 * 读取 session 的所有事件（按时间正序）
 * @param {string} sessionId
 * @param {string|null} afterTimestamp 只读此时间之后的事件
 * @returns {Promise<Array>}
 */
export async function getEvents(sessionId, options = {}) {
  const normalizedOptions = typeof options === 'string' ? { afterTimestamp: options } : (options || {});
  const hasSequenceCursor = Number.isFinite(Number(normalizedOptions.afterSequence));
  const afterSequence = hasSequenceCursor ? Number(normalizedOptions.afterSequence) : null;
  const result = await query({
    table: EVENTS_TABLE,
    action: 'select',
    filter: { session_id: sessionId },
    queryOptions: {
      orderBy: hasSequenceCursor ? 'sequence:asc' : 'sequence:desc',
      limit: Math.min(Number(normalizedOptions.limit || 200), 200),
      ...(hasSequenceCursor ? { greaterThan: { sequence: afterSequence } } : {}),
    },
  });
  let events = (result.rows || [])
    .map((row, index) => rowToAgentEvent(row, index + 1))
    .sort((left, right) => left.sequence - right.sequence);
  if (normalizedOptions.afterTimestamp) {
    const after = new Date(normalizedOptions.afterTimestamp).getTime();
    events = events.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t > after;
    });
  }
  if (hasSequenceCursor) events = events.filter((event) => event.sequence > afterSequence);
  if (normalizedOptions.browserVisibleOnly) events = events.filter(isBrowserVisibleEvent);
  return events;
}

export function isBrowserVisibleEvent(event) {
  return event?.visibility === 'public' || event?.visibility === 'summary';
}

function normalizeVisibility(visibility, type) {
  if (AGENT_EVENT_VISIBILITIES.includes(visibility)) return visibility;
  if (INTERNAL_BY_DEFAULT.has(type)) return 'internal';
  if (SUMMARY_BY_DEFAULT.has(type)) return 'summary';
  return 'public';
}

function rowToAgentEvent(row, fallbackSequence) {
  const eventId = row.id || row.event_id;
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {});
  return withLegacyAliases({
    eventId,
    sessionId: row.session_id,
    sequence: Number(row.sequence || fallbackSequence),
    type: row.type,
    actorId: row.actor_id || row.actor || 'system',
    ...(row.task_id ? { taskId: row.task_id } : {}),
    ...(row.causation_id ? { causationId: row.causation_id } : {}),
    correlationId: row.correlation_id || payload.correlationId || `corr_${eventId}`,
    payload,
    visibility: normalizeVisibility(row.visibility, row.type),
    createdAt: row.created_at || new Date().toISOString(),
    schemaVersion: Number(row.schema_version || AGENT_EVENT_SCHEMA_VERSION),
  });
}

export function withLegacyAliases(event) {
  Object.defineProperties(event, {
    id: { enumerable: false, get: () => event.eventId },
    data: { enumerable: false, get: () => event.payload },
    actor: { enumerable: false, get: () => event.actorId },
    timestamp: { enumerable: false, get: () => event.createdAt },
  });
  return event;
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
