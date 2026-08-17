const REPLAY_SCHEMA_VERSION = 2;
const COMPLETENESS = new Set(['complete', 'partial', 'local_only']);
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

function parse(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function textOf(value) {
  if (typeof value === 'string') return value.trim();
  return String(value?.text || value?.content || value?.message || '').trim();
}

function timeOf(value) {
  const candidate = value?.occurredAt || value?.timestamp || value?.createdAt || '';
  const parsed = candidate ? new Date(candidate) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '';
}

function normalizeEvent(raw, fallbackSeq) {
  const text = textOf(raw);
  const kind = String(raw?.kind || '').trim();
  if (!text || !EVENT_KINDS.has(kind)) return null;
  const seq = Number.isInteger(raw?.seq) && raw.seq > 0 ? raw.seq : fallbackSeq;
  return {
    id: String(raw?.id || raw?.sourceEventId || `replay-${seq}`).trim(),
    seq,
    kind,
    phase: String(raw?.phase || '').trim(),
    speakerType: String(raw?.speakerType || '').trim(),
    speakerId: String(raw?.speakerId || '').trim(),
    speakerName: String(raw?.speakerName || '').trim(),
    text,
    sourceEventId: String(raw?.sourceEventId || '').trim(),
    occurredAt: timeOf(raw),
  };
}

export function normalizeReplay(value) {
  const replay = parse(value, null);
  if (!replay || typeof replay !== 'object') {
    return { schemaVersion: 1, completeness: 'partial', events: [] };
  }
  const events = (Array.isArray(replay.events) ? replay.events : [])
    .map((event, index) => normalizeEvent(event, index + 1))
    .filter(Boolean)
    .sort((left, right) => left.seq - right.seq)
    .map((event, index) => ({ ...event, seq: index + 1 }));
  return {
    schemaVersion: replay.schemaVersion === REPLAY_SCHEMA_VERSION ? REPLAY_SCHEMA_VERSION : 1,
    completeness: COMPLETENESS.has(replay.completeness) ? replay.completeness : 'partial',
    events,
  };
}

export function buildReplayTimeline({
  question = '',
  answeredRounds = [],
  caseFile = null,
  agentDialogues = {},
  activeAgents = [],
  selectedChoice = null,
  currentCommit = '',
  ticket = null,
  eventLog = [],
} = {}) {
  const events = [];
  const seenSourceEvents = new Set();

  const append = (raw) => {
    const sourceEventId = String(raw?.sourceEventId || '').trim();
    if (sourceEventId && seenSourceEvents.has(sourceEventId)) return;
    const event = normalizeEvent({ ...raw, seq: events.length + 1 }, events.length + 1);
    if (!event) return;
    if (sourceEventId) seenSourceEvents.add(sourceEventId);
    event.id = sourceEventId || `replay-${events.length + 1}`;
    events.push(event);
  };

  append({
    kind: 'user_question',
    phase: 'input',
    speakerType: 'user',
    speakerId: 'user',
    speakerName: '我',
    text: question,
  });

  (Array.isArray(answeredRounds) ? answeredRounds : []).forEach((round) => {
    append({
      kind: 'clarification_question',
      phase: 'clarify_loop',
      speakerType: 'system',
      speakerId: 'yan',
      speakerName: '演',
      text: round?.question,
      sourceEventId: round?.questionEventId,
      occurredAt: round?.questionOccurredAt,
    });
    append({
      kind: 'clarification_answer',
      phase: 'clarify_loop',
      speakerType: 'user',
      speakerId: 'user',
      speakerName: '我',
      text: round?.userAnswer || round?.answer,
      sourceEventId: round?.answerEventId,
      occurredAt: round?.answerOccurredAt,
    });
  });

  if (caseFile?.confirmed === true || caseFile?.status === 'confirmed') {
    append({
      kind: 'case_confirmed',
      phase: 'case_file_confirm',
      speakerType: 'system',
      speakerId: 'case_file',
      speakerName: '本局案卷',
      text: caseFile?.understanding || caseFile?.objective || '案卷已确认',
      sourceEventId: caseFile?.confirmationEventId,
    });
  }

  const history = agentDialogues?.history && typeof agentDialogues.history === 'object'
    ? agentDialogues.history
    : {};
  const advisors = new Map((Array.isArray(activeAgents) ? activeAgents : [])
    .filter((agent) => agent?.id)
    .map((agent) => [String(agent.id), agent]));
  const orderedSpeakerIds = [
    ...advisors.keys(),
    ...Object.keys(history).filter((id) => !advisors.has(id) && id !== 'user' && id !== 'yan'),
    ...(Object.hasOwn(history, 'yan') ? ['yan'] : []),
    ...(Object.hasOwn(history, 'user') ? ['user'] : []),
  ];

  orderedSpeakerIds.forEach((speakerId) => {
    const speaker = advisors.get(speakerId);
    const values = Array.isArray(history[speakerId]) ? history[speakerId] : [history[speakerId]];
    values.forEach((value) => {
      const isUser = speakerId === 'user';
      const isSystem = speakerId === 'yan';
      append({
        kind: isUser ? 'user_message' : 'advisor_message',
        phase: isUser ? 'agent_debate' : 'agent_debate',
        speakerType: isUser ? 'user' : (isSystem ? 'system' : 'advisor'),
        speakerId,
        speakerName: isUser ? '我' : (isSystem ? '演' : (speaker?.name || speakerId)),
        text: value,
        sourceEventId: value?.eventId || value?.__eventId,
        occurredAt: value,
      });
    });
  });

  (Array.isArray(eventLog) ? eventLog : []).forEach((event) => append(event));

  append({
    kind: 'path_selected',
    phase: 'branch_select',
    speakerType: 'user',
    speakerId: 'user',
    speakerName: '我',
    text: selectedChoice?.label || selectedChoice?.title,
    sourceEventId: selectedChoice?.eventId,
  });
  append({
    kind: 'commitment',
    phase: 'committing',
    speakerType: 'user',
    speakerId: 'user',
    speakerName: '我',
    text: currentCommit || ticket?.feedback,
    sourceEventId: ticket?.commitEventId,
  });
  append({
    kind: 'fate_ticket_created',
    phase: 'final',
    speakerType: 'system',
    speakerId: 'fate_ticket',
    speakerName: '命牌',
    text: ticket?.summary,
    sourceEventId: ticket?.ticketId,
    occurredAt: ticket?.timestamp,
  });

  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    completeness: 'complete',
    events,
  };
}

export { EVENT_KINDS, REPLAY_SCHEMA_VERSION };
