const STORAGE_PREFIX = 'yance:advisor-threads:';

function cleanIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function formatAdvisorResponse(value) {
  if (value && typeof value === 'object') {
    const claim = value.claim || value.content || '';
    const assumptions = Array.isArray(value.assumptions) ? value.assumptions.filter(Boolean) : [];
    const reversals = Array.isArray(value.reversalConditions) ? value.reversalConditions.filter(Boolean) : [];
    return [
      claim,
      value.reasoning ? `我这样判断，是因为：${value.reasoning}` : '',
      assumptions.length ? `不过还要确认：${assumptions.join('；')}` : '',
      reversals.length ? `如果出现这些情况，我会改判：${reversals.join('；')}` : '',
      Number.isFinite(Number(value.confidence)) ? `目前把握 ${Math.round(Number(value.confidence) * 100)}%。` : '',
    ].filter(Boolean).join('\n\n');
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const labels = ['主张', '依据', '假设', '反转条件', '置信度'];
  const parts = {};
  labels.forEach((label, index) => {
    const start = raw.indexOf(`【${label}】`);
    if (start < 0) return;
    const later = labels.slice(index + 1).map((next) => raw.indexOf(`【${next}】`, start + label.length + 2)).filter((pos) => pos >= 0);
    parts[label] = raw.slice(start + label.length + 2, later.length ? Math.min(...later) : raw.length).trim();
  });
  if (!parts.主张) return raw;
  return [
    parts.主张,
    parts.依据 ? `我这样判断，是因为：${parts.依据}` : '',
    parts.假设 && !/^无[；;。]?$/.test(parts.假设) ? `不过还要确认：${parts.假设}` : '',
    parts.反转条件 ? `如果出现这些情况，我会改判：${parts.反转条件}` : '',
    parts.置信度 ? `目前把握 ${parts.置信度.replace(/[。.]$/, '')}。` : '',
  ].filter(Boolean).join('\n\n');
}

export function advisorResponseText(agent) {
  return formatAdvisorResponse(agent?.finding || agent?.contribution || '');
}

export function collectPendingAdvisorResponses({ agents = {}, pending, seen }) {
  if (!(pending instanceof Map) || !(seen instanceof Set)) return [];
  return Object.values(agents).flatMap((agent) => {
    const request = pending.get(agent?.id);
    if (!agent?.id || !request) return [];
    const text = advisorResponseText(agent);
    if (!text) return [];
    const findingToken = agent?.finding?.findingId || agent?.finding?.round || normalizeText(text);
    const id = `advisor:${request.requestId}:${agent.id}:${findingToken}`;
    if (seen.has(id)) return [];
    seen.add(id);
    pending.delete(agent.id);
    return [{ id, agent, text, threadId: request.threadId }];
  });
}

export function privateThreadId(advisorId) {
  return `private:${String(advisorId || '')}`;
}

export function createAdvisorThread(sessionId, memberIds, options = {}) {
  const members = cleanIds(memberIds);
  const kind = options.kind || (members.length === 1 ? 'private' : 'group');
  return {
    id: options.id || (kind === 'private' ? privateThreadId(members[0]) : `group:${Date.now().toString(36)}`),
    sessionId: String(sessionId || ''),
    kind,
    title: options.title || '',
    memberIds: members,
    messages: [],
    updatedAt: Date.now(),
  };
}

export function appendThreadMessage(thread, message) {
  if (!thread || !message?.id) return thread;
  if ((thread.messages || []).some((item) => item.id === message.id)) return thread;
  return {
    ...thread,
    messages: [...(thread.messages || []), { ...message, memberSnapshot: cleanIds(message.memberSnapshot || thread.memberIds) }],
    updatedAt: Date.now(),
  };
}

export function participantMemory(threads, advisorId, excludeThreadId = '') {
  return (threads || []).flatMap((thread) => (
    thread.id === excludeThreadId ? [] : (thread.messages || []).filter((message) => (
      (message.memberSnapshot || []).includes(advisorId) || message.authorId === advisorId
    )).map((message) => ({ ...message, threadId: thread.id, threadTitle: thread.title }))
  ));
}

export function loadAdvisorThreads(sessionId) {
  if (!sessionId) return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(`${STORAGE_PREFIX}${sessionId}`) || '[]');
    return Array.isArray(parsed) ? parsed.filter((thread) => thread?.sessionId === sessionId) : [];
  } catch { return []; }
}

export function saveAdvisorThreads(sessionId, threads) {
  if (!sessionId) return;
  try { sessionStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(threads || [])); } catch {}
}

export function mentionMemberIds(text, advisors = []) {
  const value = String(text || '');
  const normalizeAlias = (alias) => String(alias || '').trim();
  return cleanIds(advisors.filter((advisor) => {
    const aliases = [
      advisor.name,
      advisor.agentName,
      advisor.displayName,
      advisor.title,
      advisor.stance,
      advisor.perspectiveLabel,
      advisor.id,
    ].map(normalizeAlias).filter(Boolean);
    return aliases.some((alias) => value.includes(`@${alias}`));
  }).map((advisor) => advisor.id));
}

export default { appendThreadMessage, advisorResponseText, collectPendingAdvisorResponses, createAdvisorThread, formatAdvisorResponse, loadAdvisorThreads, mentionMemberIds, participantMemory, privateThreadId, saveAdvisorThreads };
