import { useEffect, useMemo, useRef, useState } from 'react';
import {
  appendThreadMessage,
  advisorResponseText,
  collectPendingAdvisorResponses,
  createAdvisorThread,
  formatAdvisorResponse,
  loadAdvisorThreads,
  mentionMemberIds,
  participantMemory,
  privateThreadId,
  saveAdvisorThreads,
} from '../../game/advisorThreads.js';
import './advisorThreadPanel.css';

function advisorName(advisor) {
  return advisor?.agentName || advisor?.name || advisor?.id || '智囊';
}

export default function AdvisorThreadPanel({ sessionId, advisors = [], projection, onQuestion, pending = false, focusedAdvisorId = '', onFocusAdvisor, history = {}, variant = 'inline' }) {
  const [threads, setThreads] = useState(() => loadAdvisorThreads(sessionId));
  const [activeThreadId, setActiveThreadId] = useState('');
  const [draft, setDraft] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const seenResponses = useRef(new Set());
  const pendingResponseTargets = useRef(new Map());
  const requestSequence = useRef(0);
  const projectedAgents = projection?.agents || {};

  useEffect(() => {
    seenResponses.current = new Set();
    pendingResponseTargets.current = new Map();
    const loaded = loadAdvisorThreads(sessionId);
    setThreads(loaded);
    setActiveThreadId(loaded[0]?.id || '');
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || advisors.length === 0 || focusedAdvisorId || threads.length > 0) return;
    const openingThread = createAdvisorThread(sessionId, advisors.map((advisor) => advisor.id), {
      id: `opening:${sessionId}`,
      kind: 'group',
      title: '本轮开场',
    });
    setThreads([openingThread]);
    setActiveThreadId(openingThread.id);
  }, [advisors, focusedAdvisorId, sessionId, threads.length]);

  useEffect(() => { saveAdvisorThreads(sessionId, threads); }, [sessionId, threads]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) || null;
  useEffect(() => { setMemberIds(activeThread?.memberIds || []); }, [activeThreadId, activeThread?.updatedAt]);

  const openPrivate = (advisor) => {
    const id = privateThreadId(advisor.id);
    setThreads((previous) => previous.some((thread) => thread.id === id)
      ? previous
      : [...previous, createAdvisorThread(sessionId, [advisor.id], { id, title: advisorName(advisor) })]);
    setActiveThreadId(id);
    onFocusAdvisor?.(advisor.id);
  };

  useEffect(() => {
    if (!focusedAdvisorId) return;
    const advisor = advisors.find((item) => item.id === focusedAdvisorId);
    if (!advisor) return;
    const id = privateThreadId(advisor.id);
    setThreads((previous) => previous.some((thread) => thread.id === id)
      ? previous
      : [...previous, createAdvisorThread(sessionId, [advisor.id], { id, title: advisorName(advisor) })]);
    setActiveThreadId(id);
  }, [focusedAdvisorId, sessionId, advisors]);

  const createGroup = () => {
    const initial = memberIds.length > 0 ? memberIds : advisors.map((advisor) => advisor.id);
    if (initial.length === 0) return;
    const thread = createAdvisorThread(sessionId, initial, { kind: 'group', title: '临时讨论' });
    setThreads((previous) => [...previous, thread]);
    setActiveThreadId(thread.id);
  };

  useEffect(() => {
    const responses = collectPendingAdvisorResponses({ agents: projectedAgents, pending: pendingResponseTargets.current, seen: seenResponses.current });
    if (responses.length === 0) return;
    setThreads((previous) => previous.map((thread) => {
      let next = thread;
      for (const response of responses) {
        if (next.id !== response.threadId) continue;
        const latestUser = [...(next.messages || [])].reverse().find((message) => message.role === 'user' && message.status === 'sent');
        if (!latestUser?.memberSnapshot?.includes(response.agent.id)) continue;
        next = appendThreadMessage(next, {
          id: response.id,
          role: 'advisor',
          authorId: response.agent.id,
          authorName: advisorName(response.agent),
          text: response.text,
          memberSnapshot: latestUser.memberSnapshot,
          createdAt: Date.now(),
        });
      }
      return next;
    }));
  }, [projectedAgents]);

  const matchedMentions = mentionMemberIds(draft, advisors);
  const effectiveMembers = [...new Set([...memberIds, ...matchedMentions])];
  const send = async () => {
    const text = draft.trim();
    if (!activeThread || !text || effectiveMembers.length === 0 || pending) return;
    const message = {
      id: `user:${Date.now().toString(36)}`,
      role: 'user',
      authorId: 'user',
      authorName: '我',
      text,
      memberSnapshot: effectiveMembers,
      status: 'sent',
      createdAt: Date.now(),
    };
    setThreads((previous) => previous.map((thread) => thread.id === activeThread.id
      ? appendThreadMessage({ ...thread, kind: effectiveMembers.length > 1 ? 'group' : thread.kind, memberIds: effectiveMembers }, message)
      : thread));
    setMemberIds(effectiveMembers);
    setDraft('');
    const requestId = `${sessionId || 'session'}:${Date.now().toString(36)}:${requestSequence.current += 1}`;
    effectiveMembers.forEach((advisorId) => pendingResponseTargets.current.set(advisorId, { threadId: activeThread.id, requestId }));
    try {
      await onQuestion?.('QUESTION', effectiveMembers, text);
    } catch {
      effectiveMembers.forEach((advisorId) => pendingResponseTargets.current.delete(advisorId));
      setThreads((previous) => previous.map((thread) => thread.id === activeThread.id
        ? { ...thread, messages: (thread.messages || []).map((item) => item.id === message.id ? { ...item, status: 'failed' } : item) }
        : thread));
    }
  };

  const activeAdvisorId = activeThread?.kind === 'private' ? activeThread.memberIds[0] : '';
  const openingStatements = useMemo(() => {
    if (activeThread?.kind !== 'group') return [];
    return advisors.flatMap((advisor) => {
      const projectedText = advisorResponseText(projectedAgents[advisor.id]);
      const savedHistory = Array.isArray(history?.[advisor.id]) ? history[advisor.id] : [];
      const latestSaved = [...savedHistory].reverse().find((value) => (
        typeof value === 'string' ? value.trim() : String(value?.text || value?.content || '').trim()
      ));
      const text = projectedText || formatAdvisorResponse(typeof latestSaved === 'string' ? latestSaved : latestSaved?.text || latestSaved?.content || '');
      return text ? [{ advisor, text }] : [];
    });
  }, [activeThread?.kind, advisors, history, projectedAgents]);
  const relatedMemory = useMemo(() => activeAdvisorId ? participantMemory(threads, activeAdvisorId, activeThreadId) : [], [threads, activeAdvisorId, activeThreadId]);
  const activeHistory = useMemo(() => {
    if (!activeAdvisorId) return [];
    const projectedOpening = advisorResponseText(projectedAgents[activeAdvisorId]);
    const values = [
      ...(projectedOpening ? [projectedOpening] : []),
      ...(Array.isArray(history?.[activeAdvisorId]) ? history[activeAdvisorId] : []),
    ];
    const seen = new Set();
    return values.flatMap((value) => {
      const text = formatAdvisorResponse(typeof value === 'string' ? value : value?.text || value?.content || '');
      const key = String(text).trim().replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [String(text).trim()];
    });
  }, [activeAdvisorId, history, projectedAgents]);

  return (
    <section className={`advisor-thread-panel advisor-thread-panel--${variant}`} aria-label="智囊对话">
      <header>
        <span><strong>{activeThread?.title || (variant === 'workbench' ? '本局智囊对话' : '智囊对话')}</strong><small>{advisors.length} 位正式智囊 · 私聊与 @ 不改变本局阵容</small></span>
        <button type="button" onClick={createGroup}>＋ 群聊</button>
      </header>
      {activeThread ? <>
        <div className="advisor-thread-panel__thread-bar">
          <div className="advisor-thread-panel__thread-tabs">
          {threads.map((thread) => <button type="button" key={thread.id} data-active={thread.id === activeThreadId} onClick={() => setActiveThreadId(thread.id)}>{thread.kind === 'private' ? thread.title : `${thread.title} · ${thread.memberIds.length}人`}</button>)}
          </div>
          <details className="advisor-thread-panel__roster"><summary>成员 {effectiveMembers.length}/{advisors.length}</summary>
            <nav className="advisor-thread-panel__people" aria-label="打开智囊单聊">
              {advisors.map((advisor) => <button type="button" key={advisor.id} data-active={activeThreadId === privateThreadId(advisor.id)} onClick={() => openPrivate(advisor)}><i>{advisor.trigram || advisor.icon || '◦'}</i><span>{advisorName(advisor)}</span></button>)}
            </nav>
            <div className="advisor-thread-panel__members">
              <strong>下一条发给</strong>
              {advisors.map((advisor) => <button type="button" key={advisor.id} aria-pressed={effectiveMembers.includes(advisor.id)} onClick={() => setMemberIds((previous) => previous.includes(advisor.id) ? previous.filter((id) => id !== advisor.id) : [...previous, advisor.id])}>{effectiveMembers.includes(advisor.id) ? '✓ ' : '+ '}{advisorName(advisor)}</button>)}
            </div>
          </details>
        </div>
        <div className="advisor-thread-panel__messages">
          {(activeThread.messages || []).length === 0 && openingStatements.length > 0 && <details className="advisor-thread-panel__round-record"><summary>开演发言 · {openingStatements.length} 位已到</summary>{openingStatements.map(({ advisor, text }) => <article key={`${advisor.id}:opening`} data-role="advisor"><span>{advisorName(advisor)}</span><p>{text}</p></article>)}</details>}
          {(activeThread.messages || []).length === 0 && activeHistory.length > 0 && <details className="advisor-thread-panel__round-record"><summary>此前发言 · {activeHistory.length} 条</summary>{activeHistory.map((text, index) => <article key={`${activeAdvisorId}:history:${index}`} data-role="advisor"><span>{advisorName(advisors.find((advisor) => advisor.id === activeAdvisorId))}</span><p>{text}</p></article>)}</details>}
          {(activeThread.messages || []).length === 0 && activeHistory.length === 0 && openingStatements.length === 0 && <div className="advisor-thread-panel__empty"><strong>正在等待首轮发言</strong><span>智囊完成独立判断后会自动出现在这里；输入 @智囊名 可邀请其他智囊加入下一条讨论。</span></div>}
          {(activeThread.messages || []).map((message) => <article key={message.id} data-role={message.role}><span>{message.authorName}</span><p>{message.text}</p>{message.role === 'user' && <small>{message.status === 'failed' ? '发送失败，请重新发送' : `发送给 ${message.memberSnapshot.map((id) => advisorName(advisors.find((advisor) => advisor.id === id))).join('、')}`}</small>}</article>)}
          {pending && <div className="advisor-thread-panel__waiting"><i />正在等待 {pendingResponseTargets.current.size || effectiveMembers.length} 位智囊分别回应</div>}
          {relatedMemory.length > 0 && <details><summary>这位智囊还参与过本局其他讨论 · {relatedMemory.length} 条</summary><p>这些内容会作为它自己的本局参与记忆，不会把其他智囊的私聊带进来。</p></details>}
        </div>
        <div className="advisor-thread-panel__composer">
          <div className="advisor-thread-panel__draft">
            <div className="advisor-thread-panel__mention-shortcuts"><span>@邀请</span>{advisors.filter((advisor) => !effectiveMembers.includes(advisor.id)).map((advisor) => <button type="button" key={advisor.id} onClick={() => setDraft((value) => `${value}${value && !/\s$/.test(value) ? ' ' : ''}@${advisorName(advisor)} `)}>@{advisorName(advisor)}</button>)}</div>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1200))} placeholder="继续追问；可点上方名字增减收件人，或输入 @智囊名" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
          </div>
          <button type="button" onClick={send} disabled={!draft.trim() || effectiveMembers.length === 0 || pending}>{pending ? '正在生成回应…' : `发送给 ${effectiveMembers.length} 位`}</button>
        </div>
      </> : <div className="advisor-thread-panel__empty"><strong>先选择一位智囊</strong><span>点击上方名字打开独立单聊，或新建临时讨论。</span></div>}
    </section>
  );
}
