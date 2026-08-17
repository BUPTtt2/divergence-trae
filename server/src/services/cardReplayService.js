const EVENT_KINDS = new Set([
  'user_question',
  'clarification_question',
  'clarification_answer',
  'case_confirmed',
  'advisor_message',
  'advisor_failed',
  'user_message',
  'path_selected',
  'commitment',
  'fate_ticket_created',
]);
const COMPLETENESS = new Set(['complete', 'partial', 'local_only']);
const MAX_EVENTS = 1000;
const MAX_TEXT = 4000;

function parse(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || 'null'); } catch { return null; }
}

function validationError(message, code = 'INVALID_REPLAY') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function bounded(value, maximum) {
  return String(value || '').trim().slice(0, maximum);
}

export function normalizeCardReplay(value, { required = false } = {}) {
  const replay = parse(value);
  if (!replay) {
    if (required) throw validationError('完整过程格式无效');
    return { schemaVersion: 1, completeness: 'partial', events: [] };
  }
  if (replay.schemaVersion !== 2) throw validationError('只接受 Replay V2');
  if (!COMPLETENESS.has(replay.completeness)) throw validationError('完整性状态无效');
  if (!Array.isArray(replay.events) || replay.events.length > MAX_EVENTS) {
    throw validationError(`完整过程最多 ${MAX_EVENTS} 条`);
  }
  const ids = new Set();
  const events = replay.events.map((event, index) => {
    const id = bounded(event?.id || event?.sourceEventId, 160);
    const kind = bounded(event?.kind, 60);
    const text = String(event?.text || '').trim();
    if (!id || ids.has(id)) throw validationError('过程事件 ID 必须存在且唯一');
    if (event?.seq !== index + 1) throw validationError('过程事件顺序不连续');
    if (!EVENT_KINDS.has(kind)) throw validationError('过程事件类型不受支持');
    if (!text || text.length > MAX_TEXT) throw validationError(`过程事件正文长度必须为 1-${MAX_TEXT}`);
    ids.add(id);
    return {
      id,
      seq: index + 1,
      kind,
      phase: bounded(event?.phase, 60),
      speakerType: bounded(event?.speakerType, 40),
      speakerId: bounded(event?.speakerId, 160),
      speakerName: bounded(event?.speakerName, 80),
      text,
      sourceEventId: bounded(event?.sourceEventId, 160),
      occurredAt: bounded(event?.occurredAt, 40),
    };
  });
  return { schemaVersion: 2, completeness: replay.completeness, events };
}

export function requireAppendOnlyReplay(existingValue, incomingValue) {
  const existing = normalizeCardReplay(existingValue);
  const incoming = normalizeCardReplay(incomingValue, { required: true });
  if (incoming.events.length < existing.events.length) {
    throw validationError('完整过程只允许追加', 'REPLAY_NOT_APPEND_ONLY');
  }
  for (let index = 0; index < existing.events.length; index += 1) {
    if (JSON.stringify(existing.events[index]) !== JSON.stringify(incoming.events[index])) {
      throw validationError('完整过程只允许追加', 'REPLAY_NOT_APPEND_ONLY');
    }
  }
  return incoming;
}

export function replayColumns(replay) {
  return {
    replay,
    replay_schema_version: replay.schemaVersion,
    replay_completeness: replay.completeness,
  };
}

export { EVENT_KINDS, MAX_EVENTS, MAX_TEXT };
