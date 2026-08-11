import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  startDeliberation,
  routeConversation,
  planDeliberation,
  answerDeliberation,
  confirmCaseDeliberation,
  executeDeliberation,
  interjectDeliberation,
  commitDeliberation,
  getMemories,
  getDeliberation,
  saveSnapshot,
  probeBackend,
  resumeStream,
  setRunMode,
} from '../services/deliberationClient';
import { useDeliberationStream } from '../hooks/useDeliberationStream';
import { createPendingActionRegistry, deliberationActionKey } from './deliberationActions';
import { applyAgentEvent, applyTransportEvent, createArenaProjection, projectSessionSnapshot } from './agentEventProjection';
import { readStoredSseCursor } from '../services/sseStream';
import {
  adaptFateTicket,
  mapSessionToInternalPhase,
  sessionIsPaused,
  mapServerStateToInternalPhase,
  selectedAdvisorIdsForSession,
  resolveDirectChoice,
  classifySessionFailure,
  resolveSessionRestore,
  clearExpiredSessionRecovery,
  restorableSessionId,
  shouldRequestPlanning,
  shouldResumePlanning,
} from './sandboxRuntime';
import tracker from '../services/tracker';
import { persistDecisionCard } from './decisionCollectionStore.js';
import { loadCouncilCatalog } from '../services/advisorClient';
import { createCouncilModel } from './councilModel';
import { emitRuntimeStatus } from '../services/runtimeStatus.js';

const PHASE = {
  IDLE: 'idle',
  CASTING: 'casting',
  SUMMONING: 'summoning',
  CLARIFY: 'clarify',
  READY: 'ready',
  COUNCIL: 'council',
  DEBATE: 'debate',
  CHOICE: 'choice',
  REVEAL: 'reveal',
  DONE: 'done',
  ORACLE: 'oracle',
  BRANCH: 'branch',
  COMMITTING: 'committing',
  DIRECT: 'direct',
};

const INTERNAL_TO_VIEW_PHASE = Object.freeze({
  [PHASE.IDLE]: 'input',
  [PHASE.CASTING]: 'casting',
  [PHASE.SUMMONING]: 'yan_analyze',
  [PHASE.CLARIFY]: 'clarify_loop',
  [PHASE.READY]: 'case_file_confirm',
  [PHASE.COUNCIL]: 'agent_select',
  [PHASE.DEBATE]: 'agent_debate',
  [PHASE.CHOICE]: 'summary',
  [PHASE.ORACLE]: 'oracle',
  [PHASE.BRANCH]: 'branch_select',
  [PHASE.REVEAL]: 'path_reveal',
  [PHASE.COMMITTING]: 'committing',
  [PHASE.DONE]: 'final',
  [PHASE.DIRECT]: 'direct_answer',
});

const VIEW_PHASE_LABEL = Object.freeze({
  input: '推演台 · 待命',
  casting: '演 · 建立会话',
  yan_analyze: '演 · 规划与召智',
  clarify_loop: '演 · 澄清关键事实',
  case_file_confirm: '案卷 · 确认后开演',
  agent_select: '智囊会 · 选择本局阵容',
  agent_debate: '诸智 · 推演中',
  summary: '演 · 汇聚结论',
  oracle: '卦象 · 认知镜面',
  branch_select: '分岔 · 选择路径',
  path_reveal: '命签 · 待落印',
  final: '推演 · 已归档',
  direct_answer: '直接回应 · 无需开演',
});

function internalPhaseForServerState(state) {
  return mapServerStateToInternalPhase(state);
}

const MAX_DEBATE_ROUNDS = 3;
const ACTIVE_SESSION_KEY = 'yance_active_deliberation_session';

function dialogueFingerprint(agentId, value, source = '') {
  const text = typeof value === 'string' ? value : value?.text || value?.content || '';
  const eventId = typeof value === 'object' ? value?.eventId || value?.__eventId : '';
  return eventId ? `event:${eventId}` : `${agentId}:${source}:${String(text).trim().replace(/\s+/g, ' ')}`;
}

function appendUniqueHistory(history, agentId, entry, source = '') {
  const existing = Array.isArray(history?.[agentId]) ? history[agentId] : [];
  const fingerprint = dialogueFingerprint(agentId, entry, source);
  if (!fingerprint || existing.some((item) => dialogueFingerprint(agentId, item, item?.source || source) === fingerprint)) return history;
  return { ...(history || {}), [agentId]: [...existing, entry] };
}

function notifyActiveSessionChanged() {
  try { window.dispatchEvent(new CustomEvent('yance:active-session-changed')); } catch {}
}

export function useDeliberationFlow(initialQuestion = "") {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [inference, setInference] = useState(null);
  const [agentDialogues, setAgentDialogues] = useState({ history: {} });
  const [runMode, setRunModeState] = useState('REMOTE');
  const [deliberationSessionId, setDeliberationSessionId] = useState(null);
  const [deliberationOracle, setDeliberationOracle] = useState(null);
  const [deliberationFindings, setDeliberationFindings] = useState(null);
  const [deliberationCommitResult, setDeliberationCommitResult] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [awaitingUser, setAwaitingUser] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [backendError, setBackendError] = useState(null);
  const [showQuestion, setShowQuestion] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [showInput, setShowInput] = useState(true);
  const [floatTip, setFloatTip] = useState(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [awaitingAnswers, setAwaitingAnswers] = useState([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState(new Set());
  const [inputValue, setInputValue] = useState(initialQuestion || '');
  const [userInput, setUserInput] = useState('');
  const [choices, setChoices] = useState([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [currentCommit, setCurrentCommit] = useState('');
  const [oracleThrowing, setOracleThrowing] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);
  const [debateRound, setDebateRound] = useState(1);
  const [debateConvergence, setDebateConvergence] = useState(null);
  const [showAgentErrorModal, setShowAgentErrorModal] = useState(false);
  const [agentErrors, setAgentErrors] = useState({});
  const [agentCallResults, setAgentCallResults] = useState({});
  const [toolCallState, setToolCallState] = useState({
    agentId: null, tools: [], currentTool: null, results: [], status: 'idle',
  });
  const [fateContent, setFateContent] = useState(null);
  const [yanMemories, setYanMemories] = useState([]);
  const [yanConversationId, setYanConversationId] = useState(null);
  const [debateBlackboard, setDebateBlackboard] = useState(null);
  const [debateMentionQueue, setDebateMentionQueue] = useState([]);
  const [debugLogs, setDebugLogs] = useState([]);
  const [plannedAgents, setPlannedAgents] = useState([]);
  const [debateAutoPlay, setDebateAutoPlay] = useState(true);
  const [fateRevealed, setFateRevealed] = useState(false);
  const [yanQuestionRounds, setYanQuestionRounds] = useState([]);
  const [commitPending, setCommitPending] = useState(false);
  const [arenaProjection, setArenaProjection] = useState(createArenaProjection);
  const [pendingPlanSessionId, setPendingPlanSessionId] = useState(null);
  const [answerPending, setAnswerPending] = useState(false);
  const [processingNarrative, setProcessingNarrative] = useState(null);
  const [councilCatalog, setCouncilCatalog] = useState(() => createCouncilModel());
  const [councilCatalogLoading, setCouncilCatalogLoading] = useState(false);
  const [councilCatalogError, setCouncilCatalogError] = useState('');
  const [directResult, setDirectResult] = useState(null);

  const _addDebugLog = useCallback((msg) => {
    setDebugLogs(prev => {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const next = [...prev, `[${now}] ${msg}`];
      return next.slice(-30);
    });
    try { console.log(msg); } catch {}
  }, []);

  const LOG = useMemo(() => ({
    phase: (from, to) => _addDebugLog(`[PHASE] ${from} → ${to}`),
    start: (q) => _addDebugLog(`[START] question="${(q||'').slice(0,50)}"`),
    mode: (m) => _addDebugLog(`[MODE] ${m}`),
    session: (id) => _addDebugLog(`[SESSION] id=${id}`),
    choices: (arr) => _addDebugLog(`[CHOICES] ${arr?.length||0} options: ${(arr||[]).map(c=>c.id).join(',')}`),
    commit: (c) => _addDebugLog(`[COMMIT] choice=${c?.id} label="${c?.label||''}"`),
    save: (card) => _addDebugLog(`[SAVE] gua=${card?.gua} title="${card?.title||''}"`),
    error: (m, e) => _addDebugLog(`[ERROR] ${m}: ${e?.message || e}`),
  }), [_addDebugLog]);

  const floatTipTimer = useRef(null);
  const stageTimersRef = useRef([]);
  const prevPhaseRef = useRef(phase);
  const clarifyActiveRef = useRef(false);
  const pendingActionIdsRef = useRef(createPendingActionRegistry());
  const startOperationRef = useRef(0);
  const lastFailedActionRef = useRef(null);
  const answerInFlightRef = useRef(false);
  const commitInFlightRef = useRef(false);
  const executeInFlightRef = useRef(false);
  const activeSessionIdRef = useRef(null);
  const planningRequestSessionRef = useRef(null);

  const clearTimers = useCallback(() => {
    stageTimersRef.current.forEach(t => clearTimeout(t));
    stageTimersRef.current = [];
    if (floatTipTimer.current) { clearTimeout(floatTipTimer.current); floatTipTimer.current = null; }
  }, []);

  const showFloatTip = useCallback((msg, duration = 2400) => {
    setFloatTip(msg);
    if (floatTipTimer.current) clearTimeout(floatTipTimer.current);
    floatTipTimer.current = setTimeout(() => setFloatTip(null), duration);
  }, []);

  const _updateHistoryCount = useCallback((dialogues) => {
    const h = dialogues?.history || {};
    const count = Object.values(h).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
    setHistoryCount(count);
  }, []);

  const _appendDialogue = useCallback((agentId, text, source, round, eventId = '') => {
    setAgentDialogues(prev => {
      const entry = { text: typeof text === 'string' ? text : text?.text || text?.content || '', source, round, eventId };
      const history = appendUniqueHistory(prev.history || {}, agentId, entry, source);
      if (history === prev.history) return prev;
      _updateHistoryCount({ ...prev, history });
      return { ...prev, [agentId]: text, history };
    });
  }, [_updateHistoryCount]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      try {
        tracker.track('phase_exit', { phase: prev });
        tracker.track('phase_enter', { phase });
      } catch {}
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  useEffect(() => {
    tracker.track('phase_enter', { phase: 'input' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let storedSessionId = null;
    try { storedSessionId = sessionStorage.getItem(ACTIVE_SESSION_KEY); } catch {}
    const savedSessionId = restorableSessionId({
      currentUrl: window.location.href,
      storedSessionId,
    });
    if (!savedSessionId) return undefined;

    getDeliberation(savedSessionId).then((response) => {
      const outcome = resolveSessionRestore({ savedSessionId, response });
      if (cancelled) return;
      if (outcome.kind !== 'restored') {
        const nextUrl = clearExpiredSessionRecovery({
          sessionStorage,
          localStorage,
          currentUrl: window.location.href,
          sessionId: savedSessionId,
        });
        window.history.replaceState({}, '', nextUrl);
        activeSessionIdRef.current = null;
        setDeliberationSessionId(null);
        setPendingPlanSessionId(null);
        setPhase(PHASE.IDLE);
        setShowInput(true);
        setShowQuestion(false);
        setBackendError(outcome.message);
        notifyActiveSessionChanged();
        return;
      }
      const session = outcome.session;
      let cursor = 0;
      try { cursor = readStoredSseCursor(localStorage, savedSessionId); } catch {}
      setArenaProjection(projectSessionSnapshot(session, { lastSequence: cursor }));
      activeSessionIdRef.current = savedSessionId;
      setDeliberationSessionId(savedSessionId);
      if (shouldResumePlanning(session.state)) setPendingPlanSessionId(savedSessionId);
      setUserInput(session.question || '已恢复的推演');
      setInputValue(session.question || '');
      setShowInput(false);
      setShowQuestion(true);
      setPhase(mapSessionToInternalPhase(session));
      setIsPaused(sessionIsPaused(session));
      setInference(session);
      const agents = Array.isArray(session.plan?.agents) ? session.plan.agents : [];
      setPlannedAgents(agents);
      setSelectedAgentIds(new Set(selectedAdvisorIdsForSession(session)));
      setAwaitingAnswers(Array.isArray(session.askUser) ? session.askUser : []);
      setAwaitingUser(['WAIT', 'ROUND_REVIEW', 'DELIBERATION_BLOCKED', 'ORACLE', 'COMPLETE', 'PAUSED'].includes(session.state));
      setChoices(Array.isArray(session.dynamicChoices) ? session.dynamicChoices : []);
      setDeliberationOracle(session.oracle || null);
      setDeliberationFindings(session.findings || null);
      setDeliberationCommitResult(session.commitResult || null);
      if (session.commitResult?.fateTicket) setFateContent(adaptFateTicket(session.commitResult.fateTicket));
    }).catch((error) => {
      const outcome = resolveSessionRestore({ savedSessionId, error });
      const nextUrl = clearExpiredSessionRecovery({
        sessionStorage,
        localStorage,
        currentUrl: window.location.href,
        sessionId: savedSessionId,
      });
      try { window.history.replaceState({}, '', nextUrl); } catch {}
      activeSessionIdRef.current = null;
      setDeliberationSessionId(null);
      setPendingPlanSessionId(null);
      setPhase(PHASE.IDLE);
      setShowInput(true);
      setShowQuestion(false);
      setBackendError(outcome.message);
      notifyActiveSessionChanged();
    });

    return () => { cancelled = true; };
  }, []);

  const refreshAuthoritativeSession = useCallback(async (sessionId) => {
    if (!sessionId) return;
    const response = await getDeliberation(sessionId);
    const session = response?.session;
    if (!session?.sessionId || activeSessionIdRef.current !== sessionId) return;
    setInference(session);
    setShowInput(false);
    setShowQuestion(true);
    setPhase(mapSessionToInternalPhase(session));
    setIsPaused(sessionIsPaused(session));
    const agents = Array.isArray(session.plan?.agents) ? session.plan.agents : [];
    setPlannedAgents(agents);
    setSelectedAgentIds(new Set(selectedAdvisorIdsForSession(session)));
    const questions = Array.isArray(session.askUser) ? session.askUser : [];
    setAwaitingAnswers(questions);
    setAwaitingUser(['WAIT', 'CLARIFY', 'READY', 'ROUND_REVIEW', 'DELIBERATION_BLOCKED', 'ORACLE', 'COMPLETE', 'PAUSED'].includes(session.state));
    setChoices(Array.isArray(session.dynamicChoices) ? session.dynamicChoices : []);
    setDeliberationOracle(session.oracle || null);
    setDeliberationFindings(session.findings || null);
    setDeliberationCommitResult(session.commitResult || null);
    if (session.commitResult?.fateTicket) setFateContent(adaptFateTicket(session.commitResult.fateTicket));
  }, []);

  const recommendedAgentIds = useMemo(
    () => {
      const explicit = inference?.plan?.recommendation?.agentIds;
      return (Array.isArray(explicit) && explicit.length > 0 ? explicit : plannedAgents.map((agent) => agent?.id)).filter(Boolean);
    },
    [inference?.plan?.recommendation?.agentIds, plannedAgents],
  );
  const recommendationDetails = useMemo(() => {
    const explicit = inference?.plan?.recommendation?.details;
    if (Array.isArray(explicit) && explicit.length > 0) return explicit;
    return plannedAgents.map((agent) => ({
      agentId: agent.id,
      reason: agent.reason,
      score: agent.recommendationScore,
      matchedDimensions: agent.matchedDimensions,
    }));
  }, [inference?.plan?.recommendation?.details, plannedAgents]);
  useEffect(() => {
    if (recommendedAgentIds.length === 0) return undefined;
    let cancelled = false;
    setCouncilCatalogLoading(true);
    setCouncilCatalogError('');
    loadCouncilCatalog(recommendedAgentIds).then((catalog) => {
      if (cancelled) return;
      setCouncilCatalog(createCouncilModel({
        ...catalog,
        recommendedIds: recommendedAgentIds,
        recommendationDetails,
      }));
    }).catch((error) => {
      if (cancelled) return;
      setCouncilCatalog(createCouncilModel({ official: plannedAgents, recommendedIds: recommendedAgentIds, recommendationDetails }));
      setCouncilCatalogError(error?.message || '智囊目录暂不可用');
    }).finally(() => {
      if (!cancelled) setCouncilCatalogLoading(false);
    });
    return () => { cancelled = true; };
  }, [plannedAgents, recommendedAgentIds, recommendationDetails]);

  useEffect(() => {
    if (councilCatalog.catalog.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const returnedSessionId = params.get('resume');
    const returnedAdvisorId = params.get('advisor');
    if (!returnedAdvisorId || !councilCatalog.catalogById.has(returnedAdvisorId)) return;
    if (returnedSessionId && returnedSessionId !== deliberationSessionId) return;
    setSelectedAgentIds((previous) => new Set([...previous, returnedAdvisorId]));
  }, [councilCatalog, deliberationSessionId]);

  useDeliberationStream(deliberationSessionId, {
    onEvent: (event) => {
      if (event?.type === 'CONNECTED' || event?.type === 'REPLAY_COMPLETE') {
        setArenaProjection((previous) => applyTransportEvent(previous, event));
        return;
      }
      setArenaProjection((previous) => applyAgentEvent(previous, event, {
        replay: previous.transport.replaying,
      }));
      if (event?.type === 'CLARIFY_ASKED') {
        const questions = event?.payload?.questions || event?.data?.questions || [];
        if (Array.isArray(questions) && questions.length > 0) {
          setAwaitingAnswers(questions);
          setPhase(PHASE.CLARIFY);
          setAwaitingUser(true);
        }
      }
    },
    onThought: (data) => {
      setAgentDialogues(prev => ({
        ...prev,
        yan: data?.thought || prev.yan,
        history: appendUniqueHistory(prev.history || {}, 'yan', { text: data?.thought || '', source: 'thought', eventId: data?.__eventId }, 'thought'),
      }));
    },
    onAdvisorSpeak: (data) => {
      const agentId = data?.agentId;
      const content = data?.content || '';
      if (agentId && content) {
        _appendDialogue(agentId, content, 'llm', data?.round, data?.__eventId);
        setAgentDialogues(prev => ({ ...prev, [agentId]: content }));
      }
    },
    onStateChange: (data) => {
      if (data?.to) {
        setPhase(internalPhaseForServerState(data.to));
        if (['CLARIFY', 'WAIT', 'READY', 'ROUND_REVIEW', 'DELIBERATION_BLOCKED', 'REFLECT', 'ORACLE', 'COMPLETE', 'PAUSED'].includes(data.to)) {
          refreshAuthoritativeSession(deliberationSessionId).catch(() => {});
        }
      }
    },
    onObservation: (data) => {
      if (data?.insight) {
        setAgentDialogues(prev => ({
          ...prev,
          yan: data.insight,
          history: appendUniqueHistory(prev.history || {}, 'yan', { text: data.insight, source: 'observation', eventId: data?.__eventId }, 'observation'),
        }));
      }
    },
    onError: (data) => {
      setStreamError(data?.error || '推演流异常');
      showFloatTip('推演流异常，请重试');
    },
    onConnected: () => {
      setStreamError(null);
    },
  });

  useEffect(() => {
    if (!shouldRequestPlanning({
      pendingSessionId: pendingPlanSessionId,
      activeSessionId: deliberationSessionId,
      inFlightSessionId: planningRequestSessionRef.current,
    })) return undefined;
    const requestedSessionId = pendingPlanSessionId;
    planningRequestSessionRef.current = requestedSessionId;

    planDeliberation(requestedSessionId).then(async (session) => {
      if (activeSessionIdRef.current !== requestedSessionId || !session?.plan) return;
      setPendingPlanSessionId(null);
      setInference(session);
      const sessionAgents = Array.isArray(session.plan.agents) ? session.plan.agents : [];
      setPlannedAgents(sessionAgents);
      setSelectedAgentIds(new Set(selectedAdvisorIdsForSession(session)));
      if (session.memory) setYanMemories(session.memory);

      try {
        const mems = await getMemories();
        if (activeSessionIdRef.current === requestedSessionId && mems?.length > 0) {
          setYanMemories((previous) => [...mems, ...(previous || [])].slice(0, 20));
        }
      } catch {}
      if (activeSessionIdRef.current !== requestedSessionId) return;

      const askUser = Array.isArray(session.askUser) ? session.askUser : [];
      if (askUser.length > 0) {
        setAwaitingAnswers(askUser);
        clarifyActiveRef.current = true;
        setPhase(PHASE.CLARIFY);
        setAwaitingUser(true);
        showFloatTip('发现关键信息缺口，请补充后继续');
      } else if (session.state === 'READY') {
        setAwaitingAnswers([]);
        clarifyActiveRef.current = false;
        setPhase(PHASE.READY);
        setAwaitingUser(true);
        showFloatTip('案卷已形成，请确认后开演');
      } else {
        setAwaitingAnswers([]);
        clarifyActiveRef.current = false;
        setPhase(PHASE.DEBATE);
        setActiveAgentIdx(0);
        setAwaitingUser(true);
        showFloatTip('任务与智囊已就位，可开始推演');
      }
      setAgentDialogues((previous) => ({
        ...previous,
        yan: session.openingLine || '演 · 规划完成',
        history: {
          ...(previous.history || {}),
          yan: [...((previous.history || {}).yan || []), session.openingLine || '演 · 规划完成'],
        },
      }));
      lastFailedActionRef.current = null;
    }).catch((error) => {
      if (activeSessionIdRef.current !== requestedSessionId) return;
      setPendingPlanSessionId(null);
      lastFailedActionRef.current = { type: 'start', question: userInput };
      LOG.error('planDeliberation', error);
      setBackendError(error.message || '推演规划失败');
      showFloatTip('规划失败，请重试');
      setPhase(PHASE.IDLE);
      setShowInput(true);
      setShowQuestion(false);
    }).finally(() => {
      if (planningRequestSessionRef.current === requestedSessionId) {
        planningRequestSessionRef.current = null;
      }
    });

    return undefined;
  }, [pendingPlanSessionId, deliberationSessionId, showFloatTip, LOG, userInput]);

  const handleStart = useCallback(async (question, options = {}) => {
    if (!question || !question.trim()) return;
    const operationId = ++startOperationRef.current;
    const q = question.trim();
    lastFailedActionRef.current = null;
    setUserInput(q);
    setShowInput(false);
    setShowQuestion(true);
    setPhase(PHASE.CASTING);
    LOG.start(q);
    setActiveAgentIdx(-1);
    setSelectedChoice(null);
    setAgentDialogues({ history: {} });
    setAwaitingUser(false);
    setCurrentResponse('');
    setStreamError(null);
    setBackendError(null);
    setFateContent(null);
    setDebateRound(1);
    setDebateConvergence(null);
    setDebateBlackboard(null);
    setDebateMentionQueue([]);
    setDirectResult(null);

    try {
      setRunMode('REMOTE');
      setRunModeState('REMOTE');
      const backendAvailable = await probeBackend(3000);
      if (startOperationRef.current !== operationId) return;
      if (!backendAvailable) {
        const error = new Error('Agent Runtime 后端不可达，请检查服务后重试');
        error.code = 'RUNTIME_UNAVAILABLE';
        throw error;
      }
      LOG.mode('REMOTE');

      const route = options.forceDeliberation
        ? { lane: 'deep', complexity: 2, requiresSession: true, reasons: ['user_requested_deliberation'], intentFrame: { lane: 'deep', goal: q, confidence: 1, ...(options.intentPatch || {}) } }
        : await routeConversation(q);
      if (startOperationRef.current !== operationId) return;
      if (!route.requiresSession) {
        setDirectResult(route);
        setInference({ route, question: q });
        setPhase(PHASE.DIRECT);
        setAwaitingUser(true);
        showFloatTip(route.lane === 'safety' ? '安全优先 · 不进入推演' : '已直接回应 · 未消耗多智囊流程');
        return;
      }

      showFloatTip('演 · 起卦中……');
      const session = await startDeliberation(q, { deferPlanning: true, intentFrame: route.intentFrame });
      if (startOperationRef.current !== operationId) return;
      if (!session?.sessionId || session?.state === 'LOCAL_FULL') {
        throw new Error('Agent Runtime 未返回有效 Session');
      }
      const sessionId = session.sessionId;
      activeSessionIdRef.current = sessionId;
      setDeliberationSessionId(sessionId);
      try { sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId); } catch {}
      notifyActiveSessionChanged();

      setInference(session);
      const sessionAgents = Array.isArray(session?.plan?.agents) ? session.plan.agents : [];
      setPlannedAgents(sessionAgents);
      setSelectedAgentIds(new Set());
      LOG.session(sessionId);
      setPendingPlanSessionId(sessionId);
      showFloatTip('会话已建立，正在接入推演实况');

    } catch (e) {
      if (startOperationRef.current !== operationId) return;
      lastFailedActionRef.current = { type: 'start', question: q };
      LOG.error('handleStart', e);
      setBackendError(e.message || '推演启动失败');
      setFloatTip('推演启动失败，请重试');
      setPhase(PHASE.IDLE);
      setShowInput(true);
      setShowQuestion(false);
    }
  }, [showFloatTip, LOG]);

  const handleRestart = useCallback(() => {
    startOperationRef.current += 1;
    clearTimers();
    pendingActionIdsRef.current.clear();
    setPhase(PHASE.IDLE);
    setShowInput(true);
    setShowQuestion(false);
    setUserInput('');
    setActiveAgentIdx(-1);
    setSelectedChoice(null);
    setAgentDialogues({ history: {} });
    setShowHistoryPanel(false);
    setAwaitingUser(false);
    setCurrentResponse('');
    setIsPaused(false);
    setInference(null);
    setDirectResult(null);
    setDebateRound(1);
    setDebateConvergence(null);
    setDebateBlackboard(null);
    setDebateMentionQueue([]);
    setDeliberationSessionId(null);
    activeSessionIdRef.current = null;
    planningRequestSessionRef.current = null;
    setDeliberationOracle(null);
    setDeliberationFindings(null);
    setDeliberationCommitResult(null);
    setStreamError(null);
    setBackendError(null);
    setAwaitingAnswers([]);
    setSelectedAgentIds(new Set());
    setCurrentCommit('');
    setOracleThrowing(false);
    setOracleResult(null);
    setFateContent(null);
    setAgentErrors({});
    setShowAgentErrorModal(false);
    setAgentCallResults({});
    setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });
    setYanConversationId(null);
    setYanMemories([]);
    setPlannedAgents([]);
    setDebateAutoPlay(true);
    setFateRevealed(false);
    setYanQuestionRounds([]);
    setCommitPending(false);
    setArenaProjection(createArenaProjection());
    setPendingPlanSessionId(null);
    setAnswerPending(false);
    setProcessingNarrative(null);
    setCouncilCatalog(createCouncilModel());
    setCouncilCatalogLoading(false);
    setCouncilCatalogError('');
    try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
    notifyActiveSessionChanged();
    commitInFlightRef.current = false;
    lastFailedActionRef.current = null;
  }, [clearTimers]);

  const handleDirectChoice = useCallback((choice) => {
    const next = resolveDirectChoice({ question: userInput, choice });
    if (next.action === 'none') return;
    handleStart(next.question, {
      forceDeliberation: next.action === 'start_session',
      intentPatch: next.intentPatch,
    });
  }, [userInput, handleStart]);

  const handleSelectAgent = useCallback((id) => {
    setSelectedAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAcceptRecommendedAgents = useCallback(() => {
    const validIds = (councilCatalog?.recommended || []).map((advisor) => advisor?.id).filter(Boolean);
    setSelectedAgentIds((previous) => new Set([
      ...Array.from(previous || []),
      ...validIds,
    ]));
  }, [councilCatalog]);

  const handleSubmitAnswers = useCallback(async (answers) => {
    if (answerInFlightRef.current) return;
    if (!deliberationSessionId) {
      setBackendError('无有效推演会话');
      showFloatTip('推演会话已失效，请重新开始');
      return;
    }
    try {
      answerInFlightRef.current = true;
      setAnswerPending(true);
      setAwaitingUser(false);
      setBackendError(null);
      setStreamError(null);
      showFloatTip('演 · 正在消化你的回答……');
      setProcessingNarrative({
        step: 2,
        label: '正在重整案卷',
        detail: '区分事实、理解与未知，并生成下一步',
      });

      const result = await answerDeliberation(deliberationSessionId, answers);
      lastFailedActionRef.current = null;
      clarifyActiveRef.current = false;
      setAwaitingAnswers([]);
      setYanQuestionRounds((previous) => [
        ...previous,
        ...(Array.isArray(answers) ? answers : []).map((answer, index) => ({
          question: awaitingAnswers.find((item) => (
            item?.fieldId === answer?.fieldId
            || item?.id === answer?.fieldId
            || item?.id === answer?.id
          ))?.question || awaitingAnswers[index]?.question || answer?.question || '',
          userAnswer: answer?.answer || answer?.text || answer?.content || String(answer || ''),
        })),
      ]);

      setInference((previous) => ({ ...(previous || {}), ...result }));
      if (Array.isArray(result?.plan?.agents)) {
        setPlannedAgents(result.plan.agents);
        setSelectedAgentIds(new Set(selectedAdvisorIdsForSession(result)));
      }

      setAgentDialogues(prev => ({
        ...prev,
        yan: result?.openingLine || '演 · 诸智集结……',
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), result?.openingLine || '演 · 诸智集结……'] },
      }));

      if (Array.isArray(result?.askUser) && result.askUser.length > 0) {
        setAwaitingAnswers(result.askUser);
        clarifyActiveRef.current = true;
        setPhase(PHASE.CLARIFY);
        setAwaitingUser(true);
        showFloatTip('演 · 还需确认一轮信息……');
      } else if (result?.state === 'READY') {
        setPhase(PHASE.READY);
        setAwaitingUser(true);
        showFloatTip('信息已整理为案卷，请确认后开演');
      } else {
        setPhase(PHASE.DEBATE);
        setActiveAgentIdx(0);
        setAwaitingUser(true);
        showFloatTip('诸智集结，准备发言……');
      }
      setProcessingNarrative(null);

    } catch (e) {
      const failure = classifySessionFailure(e);
      lastFailedActionRef.current = failure === 'expired' ? null : { type: 'answer', answers };
      LOG.error('handleSubmitAnswers', e);
      if (failure === 'expired') {
        try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
        activeSessionIdRef.current = null;
        setDeliberationSessionId(null);
        setPendingPlanSessionId(null);
        notifyActiveSessionChanged();
        setBackendError('原推演会话已失效，已清理旧状态。请重新开演，刚才的输入仍保留在页面中。');
        showFloatTip('旧会话已清理，请重新开演');
        setPhase(PHASE.IDLE);
        setShowInput(true);
      } else {
        setBackendError(e.message || '提交回答失败');
        showFloatTip('提交失败，请重试');
      }
      setAwaitingUser(true);
      setProcessingNarrative(null);
    } finally {
      answerInFlightRef.current = false;
      setAnswerPending(false);
    }
  }, [deliberationSessionId, showFloatTip, awaitingAnswers, LOG]);

  const handleContinueCaseQuestions = useCallback((unknowns = []) => {
    const questions = (Array.isArray(unknowns) ? unknowns : []).map((unknown, index) => ({
      id: unknown.id || `case_unknown_${index + 1}`,
      fieldId: unknown.id || `case_unknown_${index + 1}`,
      question: unknown.question || unknown.prompt || '请补充这项关键信息',
      prompt: unknown.question || unknown.prompt || '请补充这项关键信息',
      reason: unknown.reason || '这项信息会改变推演路径。',
      blocking: unknown.blocking !== false,
    }));
    if (questions.length === 0) return;
    setAwaitingAnswers(questions);
    clarifyActiveRef.current = true;
    setPhase(PHASE.CLARIFY);
    setAwaitingUser(true);
    setBackendError(null);
    showFloatTip(`还有 ${questions.length} 项关键信息，可一起回答`);
  }, [showFloatTip]);

  const handleOpenCaseFile = useCallback(() => {
    setPhase(PHASE.READY);
    setAwaitingUser(true);
    setBackendError(null);
    setStreamError(null);
    showFloatTip('已打开当前案卷；更正后会先重新确认，再决定是否重跑智囊');
  }, [showFloatTip]);

  const handleConfirmCaseFile = useCallback(async (command = {}) => {
    if (!deliberationSessionId) return;
    try {
      setAwaitingUser(false);
      setBackendError(null);
      setStreamError(null);
      showFloatTip('正在封存案卷并召集智囊……');
      const result = await confirmCaseDeliberation(deliberationSessionId, command);
      setInference((previous) => ({ ...(previous || {}), ...result }));
      if (Array.isArray(result?.plan?.agents)) {
        setPlannedAgents(result.plan.agents);
        setSelectedAgentIds(new Set(result.plan.pendingAdvisorIds || []));
      }
      setPhase(PHASE.COUNCIL);
      setActiveAgentIdx(-1);
      setAwaitingUser(true);
      setBackendError(null);
      setStreamError(null);
      showFloatTip('案卷已确认，请确认本局智囊阵容');
    } catch (error) {
      setBackendError(error.message || '案卷确认失败');
      setAwaitingUser(true);
      showFloatTip('案卷确认失败，请重试');
    }
  }, [deliberationSessionId, showFloatTip]);

  const handleSaveToCollection = useCallback(async (artworkOverride = null) => {
    try {
      const ticket = deliberationCommitResult?.fateTicket;
      if (!ticket?.ticketId) throw new Error('Session 尚未生成可收藏的命签');
      const choiceLabel = selectedChoice?.label || String(ticket.choice || '已择之路');
      const guaName = ticket.hexagram?.primary || '本卦';
      const agentNotes = (ticket.keyFindings || []).map((finding, index) => ({
        id: `finding_${index}`,
        name: finding.agentName,
        note: finding.excerpt,
        perspective: finding.perspective,
      }));

      const card = {
        sessionId: deliberationSessionId,
        sourceSessionId: deliberationSessionId,
        ticketId: ticket.ticketId,
        gua: guaName,
        trigram: selectedChoice?.icon || '☯',
        element: '',
        title: choiceLabel,
        question: ticket.question,
        decision: choiceLabel,
        style: 'Session 命签',
        advisors: agentNotes.map((note) => note.name).filter(Boolean),
        verse: ticket.oracleText || '',
        summary: ticket.summary || inference?.masterSummary || agentNotes.map((note) => note.note).filter(Boolean).join('；'),
        cardSource: 'deliberation_session',
        yanSummary: inference?.masterSummary || '',
        agentNotes,
        choice: selectedChoice ? { id: selectedChoice.id, label: selectedChoice.label, icon: selectedChoice.icon } : null,
        commit: ticket.feedback || currentCommit || '',
        date: new Date(ticket.timestamp || Date.now()).toISOString().split('T')[0],
        hasAchievement: false,
        reversalConditions: Array.isArray(ticket.reversalConditions) && ticket.reversalConditions.length > 0
          ? ticket.reversalConditions
          : (Array.isArray(inference?.reversalConditions) ? inference.reversalConditions : []),
        nextActions: Array.isArray(ticket.nextActions) && ticket.nextActions.length > 0
          ? ticket.nextActions
          : (Array.isArray(inference?.nextActions) ? inference.nextActions : []),
        evidence: Array.isArray(ticket.evidence) && ticket.evidence.length > 0
          ? ticket.evidence
          : (Array.isArray(inference?.toolResults)
            ? inference.toolResults
              .map((item) => item?.evidence)
              .filter((item) => item?.accepted === true)
            : []),
        contextIndex: Array.isArray(ticket.contextIndex) ? ticket.contextIndex : [],
        artwork: artworkOverride || ticket.artwork || { source: 'archive' },
      };

      const savedResult = await persistDecisionCard(card);
      const savedCard = savedResult?.card || savedResult;
      if (!savedCard?.id) throw new Error('命签未写入决策账本');
      LOG.save(savedCard);

      showFloatTip(savedResult.mode === 'local'
        ? `命签「${card.gua} · ${card.title}」已存本机，云端恢复后可再同步`
        : `命签「${card.gua} · ${card.title}」已写入决策账本`);
      return savedResult;
    } catch (e) {
      LOG.error('handleSaveToCollection', e);
      showFloatTip('保存失败，请重试');
      throw e;
    }
  }, [deliberationCommitResult, deliberationSessionId, inference, selectedChoice, currentCommit, showFloatTip, LOG]);

  const handleExecuteDebate = useCallback(async (roundOverride = debateRound, agentIdsOverride = null, intent = 'execute') => {
    if (!deliberationSessionId) {
      setBackendError('无有效推演会话');
      return;
    }
    if (executeInFlightRef.current) {
      showFloatTip('本轮智囊仍在推演，请稍候');
      return;
    }
    const requestedAgentIds = Array.isArray(agentIdsOverride)
      ? agentIdsOverride
      : Array.from(selectedAgentIds);
    const startedAt = performance.now();
    let stallTimer = null;
    try {
      executeInFlightRef.current = true;
      setAnswerPending(true);
      setBackendError(null);
      setStreamError(null);
      showFloatTip('演 · 诸智发言中……');
      setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });
      stallTimer = window.setTimeout(() => {
        emitRuntimeStatus({ type: 'work:stalled', reason: '智囊生成超过 18 秒，仍在等待本轮结果' });
        showFloatTip('智囊仍在生成，本轮可安全等待，无需重复点击', 5200);
      }, 18000);

      const actionKey = deliberationActionKey(roundOverride, intent);
      const result = await executeDeliberation(deliberationSessionId, {
        actionId: pendingActionIdsRef.current.get(deliberationSessionId, actionKey),
        agentIds: requestedAgentIds,
      });
      pendingActionIdsRef.current.complete(deliberationSessionId, actionKey);
      lastFailedActionRef.current = null;
      emitRuntimeStatus({ type: 'work:progress', latencyMs: performance.now() - startedAt });

      setDeliberationFindings(result.findings);
      setDeliberationOracle(result.oracle);
      const executionPlan = {
        ...(inference?.plan || {}),
        ...(result.plan || {}),
        agents: Array.isArray(result.plan?.agents) && result.plan.agents.length > 0
          ? result.plan.agents
          : plannedAgents,
        selectedAgentIds: requestedAgentIds,
        councilStatus: 'confirmed',
      };
      setInference((previous) => ({
        ...(previous || {}),
        ...result,
        plan: executionPlan,
      }));
      setArenaProjection((previous) => projectSessionSnapshot({
        ...(inference || {}),
        ...result,
        plan: executionPlan,
        sessionId: deliberationSessionId,
        findings: Array.isArray(result.findings) ? result.findings : [],
      }, { lastSequence: previous.lastSequence }));
      if (Array.isArray(result.findings) && result.findings.length > 0) {
        setAgentDialogues((previous) => {
          let history = previous.history || {};
          const latest = {};
          result.findings.forEach((finding) => {
            const agentId = finding?.agentId || finding?.advisorId || finding?.roleId;
            const text = finding?.content || finding?.finding || finding?.text || finding?.summary;
            if (!agentId || !text) return;
            const entry = { text, source: 'execute-response', round: roundOverride };
            history = appendUniqueHistory(history, agentId, entry, 'execute-response');
            latest[agentId] = text;
          });
          const next = { ...previous, ...latest, history };
          _updateHistoryCount(next);
          return next;
        });
      }
      if (result.clarifyRequired || result.state === 'CLARIFY') {
        clarifyActiveRef.current = true;
        setAwaitingAnswers(result.askUser);
        setPhase(PHASE.CLARIFY);
      } else if (result.state === 'READY') {
        if (Array.isArray(result.affectedAdvisorIds)) {
          setSelectedAgentIds(new Set(result.affectedAdvisorIds));
        }
        setPhase(PHASE.READY);
        showFloatTip(`案卷已重整；确认后只重跑 ${result.affectedAdvisorIds?.length || 0} 位受影响智囊`);
      } else if (result.state === 'PAUSED') {
        setIsPaused(true);
        setAwaitingUser(true);
        showFloatTip('推演已暂停，你可以继续补充后再开演');
      } else if (result.state === 'ROUND_REVIEW') {
        setPhase(PHASE.DEBATE);
        setAwaitingUser(true);
        setActiveAgentIdx(Math.max(0, (result.findings || []).length - 1));
        showFloatTip(`本轮已收到 ${result.contributionGate?.actualCount || result.findings?.length || 0} 位智囊判断，确认后再汇总`);
      } else if (result.state === 'DELIBERATION_BLOCKED') {
        setPhase(PHASE.DEBATE);
        setAwaitingUser(true);
        setBackendError(result.reason || '智囊贡献不足，需重试或更换智囊');
        showFloatTip('本轮未达到结论门槛，没有生成总结或命牌');
      } else {
        const dynamicChoices = Array.isArray(result.dynamicChoices) ? result.dynamicChoices : [];
        setChoices(dynamicChoices);
        setPhase(PHASE.CHOICE);
        setActiveAgentIdx(Math.max(0, plannedAgents.length - 1));
        if (result.masterSummary) {
          setAgentDialogues((previous) => ({
            ...previous,
            yan: result.masterSummary,
            history: {
              ...(previous.history || {}),
              yan: [...((previous.history || {}).yan || []), result.masterSummary],
            },
          }));
        }
        showFloatTip(null);
      }
      setAwaitingUser(true);
    } catch (e) {
      lastFailedActionRef.current = {
        type: 'execute',
        round: roundOverride,
        agentIds: requestedAgentIds,
        intent,
      };
      LOG.error('handleExecuteDebate', e);
      setBackendError(e.message || '推演执行失败');
      showFloatTip('推演执行失败，请重试');
      setStreamError(e.message);
    } finally {
      if (stallTimer) window.clearTimeout(stallTimer);
      executeInFlightRef.current = false;
      setAnswerPending(false);
    }
  }, [deliberationSessionId, debateRound, selectedAgentIds, showFloatTip, plannedAgents, LOG, inference, _updateHistoryCount]);

  const handleInterject = useCallback(async (commandType = 'SUPPLEMENT', targetAgentIds = null, contentOverride = '') => {
    if (!deliberationSessionId) return;
    const content = String(contentOverride || currentResponse || '').trim();
    const requestedTargetIds = [...new Set((Array.isArray(targetAgentIds) ? targetAgentIds : [targetAgentIds]).filter(Boolean))];
    if (commandType !== 'PAUSE' && !content) {
      showFloatTip('先写下你要补充、纠正或追问的内容');
      return;
    }
    if (commandType === 'QUESTION' && requestedTargetIds.length === 0) {
      showFloatTip('请至少选择一位要追问的智囊');
      return;
    }
    try {
      await interjectDeliberation(deliberationSessionId, { commandType, content, targetAgentIds: requestedTargetIds });
      if (commandType !== 'PAUSE') {
        setAgentDialogues((previous) => ({
          ...previous,
          history: {
            ...(previous.history || {}),
            user: [...((previous.history || {}).user || []), content],
          },
        }));
        setCurrentResponse('');
      }
      const message = {
        SUPPLEMENT: '补充已交给案卷分析 Agent，确认更新后再继续',
        CORRECTION: '纠正已交给案卷分析 Agent，当前推演已停下',
        QUESTION: `追问已交给 ${requestedTargetIds.length} 位指定智囊`,
        PAUSE: '暂停指令已提交',
      }[commandType] || '已提交';
      showFloatTip(message);
      // execute 始终携带本局已确认阵容；真正的本条收件人已经随 QUESTION
      // 写入命令队列，由后端 roundAdvisorIds 限定。这样私聊/@ 不会把本局阵容
      // 改成单个智囊，也不会破坏后续总结门槛。
      return handleExecuteDebate(debateRound);
    } catch (error) {
      setBackendError(error.message || '提交失败');
      showFloatTip('提交失败，请重试');
    }
  }, [currentResponse, debateRound, deliberationSessionId, handleExecuteDebate, showFloatTip]);

  const handleResume = useCallback(async () => {
    if (!deliberationSessionId) return;
    try {
      const result = await resumeStream(deliberationSessionId);
      if (result?.resumed || result?.state !== 'PAUSED') {
        setIsPaused(false);
        showFloatTip('推演已恢复，可以继续');
      }
    } catch (error) {
      setBackendError(error.message || '恢复推演失败');
    }
  }, [deliberationSessionId, showFloatTip]);

  const handleCommitChoice = useCallback(async (choice, feedback = currentCommit) => {
    if (!deliberationSessionId || commitInFlightRef.current) return;
    commitInFlightRef.current = true;
    setCommitPending(true);
    try {
      setSelectedChoice(choice);
      LOG.commit(choice);
      showFloatTip('演 · 落卦中……');
      const actionKey = `commit-${choice?.id || choice?.label || 'choice'}`;

      const result = await commitDeliberation(deliberationSessionId, {
        choice: choice?.id || choice?.label,
        feedback,
        actionId: pendingActionIdsRef.current.get(deliberationSessionId, actionKey),
      });

      pendingActionIdsRef.current.complete(deliberationSessionId, actionKey);
      lastFailedActionRef.current = null;
      setDeliberationCommitResult(result);
      if (result?.oracle) setDeliberationOracle(result.oracle);
      setFateContent(adaptFateTicket(result?.fateTicket));
      setInference(prev => prev ? { ...prev, ...result } : result);
      setPhase(internalPhaseForServerState(result?.state));
      setAwaitingUser(true);

      if (result?.summary) {
        setAgentDialogues(prev => ({
          ...prev,
          yan: result.summary,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), result.summary] },
        }));
      }
    } catch (e) {
      lastFailedActionRef.current = { type: 'commit', choice, feedback };
      LOG.error('handleCommitChoice', e);
      setBackendError(e.message || '提交抉择失败');
      setShowQuestion(true);
      showFloatTip('提交失败，请重试');
    } finally {
      commitInFlightRef.current = false;
      setCommitPending(false);
    }
  }, [deliberationSessionId, currentCommit, showFloatTip, LOG]);

  const handleAgentClick = useCallback(() => {
    setShowHistoryPanel(true);
  }, []);

  const handleShowChoices = useCallback(() => {
    const sessionChoices = Array.isArray(inference?.dynamicChoices) && inference.dynamicChoices.length > 0
      ? inference.dynamicChoices
      : choices;
    if (!Array.isArray(sessionChoices) || sessionChoices.length === 0) {
      setBackendError('Agent Runtime 未生成可提交的动态选项');
      showFloatTip('推演尚未形成分岔，请重试执行');
      return;
    }
    setChoices(sessionChoices);
    setPhase(PHASE.BRANCH);
    setAwaitingUser(false);
    LOG.choices(sessionChoices);
    setAgentDialogues(prev => {
      const reflectingAck = '卦已成，辞已立。\n分岔来自本次推演，请择一路。';
      return { ...prev, yan: reflectingAck, history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingAck] } };
    });
  }, [inference, choices, showFloatTip, LOG]);

  const handleUserAdvance = useCallback(async () => {
    if (phase === PHASE.IDLE) return handleStart(inputValue);
    if (phase === PHASE.CLARIFY) {
      showFloatTip('请在演的伴行栏逐项回答，或选择按现有信息继续');
      return undefined;
    }
    if (phase === PHASE.DEBATE && String(currentResponse || '').trim()) return handleInterject('SUPPLEMENT');
    if (phase === PHASE.SUMMONING || phase === PHASE.DEBATE) return handleExecuteDebate();
    if (phase === PHASE.CHOICE) return handleShowChoices();
    if (phase === PHASE.REVEAL && fateRevealed && selectedChoice) {
      setPhase(PHASE.COMMITTING);
      return undefined;
    }
    return undefined;
  }, [
    phase,
    inputValue,
    currentResponse,
    fateRevealed,
    selectedChoice,
    handleStart,
    handleExecuteDebate,
    handleInterject,
    handleShowChoices,
    showFloatTip,
  ]);

  const handleSkipClarify = useCallback(async () => {
    const skipped = awaitingAnswers.map((item) => ({
      fieldId: item.fieldId || item.taskId || item.id,
      question: item.question,
      answer: '用户选择跳过本项澄清',
    }));
    return handleSubmitAnswers(skipped.length > 0 ? skipped : [{ answer: '用户选择跳过澄清' }]);
  }, [awaitingAnswers, handleSubmitAnswers]);

  const handleConfirmAgents = useCallback(async () => {
    const minimumAdvisorCount = 2;
    if (selectedAgentIds.size < minimumAdvisorCount) {
      showFloatTip(`本轮至少需要 ${minimumAdvisorCount} 位独立智囊`);
      return;
    }
    setPhase(PHASE.DEBATE);
    setActiveAgentIdx(0);
    setAwaitingUser(false);
    return handleExecuteDebate();
  }, [handleExecuteDebate, selectedAgentIds, showFloatTip]);

  const handleRunAnotherRound = useCallback(async () => {
    const nextRound = debateRound + 1;
    setDebateRound(nextRound);
    setPhase(PHASE.DEBATE);
    return handleExecuteDebate(nextRound);
  }, [debateRound, handleExecuteDebate]);

  const handleSkipToSummary = useCallback(async () => {
    if (Array.isArray(inference?.dynamicChoices) && inference.dynamicChoices.length > 0) {
      setPhase(PHASE.CHOICE);
      return;
    }
    return handleExecuteDebate(debateRound, null, 'summary');
  }, [debateRound, inference, handleExecuteDebate]);

  const handleChoiceClick = useCallback((choice) => {
    if (!choice) return;
    setSelectedChoice(choice);
    setFateRevealed(false);
    setPhase(PHASE.REVEAL);
    setAwaitingUser(true);
  }, []);

  const handleRevealFate = useCallback(() => {
    setFateRevealed(true);
    setAwaitingUser(true);
  }, []);

  const handleStartOracle = useCallback(() => {
    const oracle = deliberationOracle || inference?.oracle;
    if (!oracle) {
      setBackendError('本次 Session 尚无卦象结果');
      showFloatTip('卦象尚未形成，请先完成推演');
      return;
    }
    setOracleResult(oracle);
    setPhase(PHASE.ORACLE);
  }, [deliberationOracle, inference, showFloatTip]);

  const handleProceedToChoices = useCallback(() => {
    if (choices.length === 0) {
      setBackendError('本次 Session 尚无动态选项');
      return;
    }
    setPhase(PHASE.BRANCH);
    setAwaitingUser(false);
  }, [choices]);

  const handleSkipOracle = useCallback(() => handleProceedToChoices(), [handleProceedToChoices]);
  const handleCommit = useCallback(() => {
    if (!selectedChoice) {
      showFloatTip('请先选择一路');
      return;
    }
    if (phase === PHASE.REVEAL) {
      setPhase(PHASE.COMMITTING);
      setAwaitingUser(true);
      return;
    }
    if (phase !== PHASE.COMMITTING || commitPending) return;
    return handleCommitChoice(selectedChoice);
  }, [phase, selectedChoice, commitPending, handleCommitChoice, showFloatTip]);

  const handleRejectRetry = useCallback(async () => {
    const failed = lastFailedActionRef.current;
    setStreamError(null);
    setBackendError(null);
    showFloatTip('正在重试……');

    if (!failed) {
      showFloatTip('事件流会自动重连；若仍无响应，请刷新后恢复 Session');
      return;
    }
    if (failed.type === 'start') return handleStart(failed.question);
    if (failed.type === 'answer') return handleSubmitAnswers(failed.answers);
    if (failed.type === 'execute') {
      setSelectedAgentIds(new Set(failed.agentIds || []));
      return handleExecuteDebate(failed.round, failed.agentIds || [], failed.intent || 'execute');
    }
    if (failed.type === 'commit') return handleCommitChoice(failed.choice, failed.feedback);
  }, [handleStart, handleSubmitAnswers, handleExecuteDebate, handleCommitChoice, showFloatTip]);

  const saveGameState = useCallback(async () => {
    if (!deliberationSessionId) return null;
    return saveSnapshot(deliberationSessionId, {
      phase: INTERNAL_TO_VIEW_PHASE[phase] || 'input',
      selectedChoice,
      currentCommit,
    });
  }, [deliberationSessionId, phase, selectedChoice, currentCommit]);

  const candidateAgents = useMemo(
    () => councilCatalog.catalog.length > 0 ? councilCatalog.catalog : plannedAgents,
    [councilCatalog, plannedAgents],
  );
  const activeAgents = useMemo(
    () => candidateAgents.filter((agent) => selectedAgentIds.has(agent.id)),
    [candidateAgents, selectedAgentIds],
  );
  const viewPhase = INTERNAL_TO_VIEW_PHASE[phase] || 'input';
  const phaseLabel = `${VIEW_PHASE_LABEL[viewPhase] || viewPhase}${inference?.fallback ? ' · 规则兜底' : ''}`;
  const caseFile = useMemo(() => inference?.caseFile || inference?.plan?.caseFile || ({
    objective: userInput,
    facts: yanQuestionRounds.map((round, index) => ({ id: `answer_${index}`, value: round.userAnswer, source: 'user' })),
    unknowns: awaitingAnswers,
    memoryCandidates: [],
  }), [inference, userInput, yanQuestionRounds, awaitingAnswers]);
  const progress = useMemo(() => ({ done: yanQuestionRounds.length, total: Math.max(1, awaitingAnswers.length + yanQuestionRounds.length) }), [yanQuestionRounds, awaitingAnswers]);
  const infoProgress = Math.min(100, Math.round((progress.done / progress.total) * 100));

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase: viewPhase,
    inputValue,
    setInputValue,
    inference,
    agentDialogues,
    runMode,
    deliberationSessionId,
    deliberationOracle,
    deliberationFindings,
    deliberationCommitResult,
    streamError,
    activeAgentIdx,
    awaitingUser,
    currentResponse,
    isPaused,
    backendError,
    showQuestion,
    selectedChoice,
    showInput,
    floatTip,
    historyCount,
    awaitingAnswers,
    clarifyActiveRef,
    selectedAgentIds,
    councilCatalog,
    councilCatalogLoading,
    councilCatalogError,
    recommendedAgentIds,
    userInput,
    showHistoryPanel,
    currentCommit,
    choices,
    oracleThrowing,
    oracleResult,
    debateRound,
    debateConvergence,
    debateBlackboard,
    debateMentionQueue,
    showAgentErrorModal,
    agentErrors,
    agentCallResults,
    toolCallState,
    fateContent,
    yanMemories,
    yanConversationId,
    MAX_DEBATE_ROUNDS,
    setPhase,
    setInference,
    setAgentDialogues,
    setRunMode: setRunModeState,
    setDeliberationSessionId,
    setActiveAgentIdx,
    setAwaitingUser,
    setCurrentResponse,
    setBackendError,
    setShowQuestion,
    setSelectedChoice,
    setShowInput,
    setFloatTip,
    setHistoryCount,
    setAwaitingAnswers,
    setSelectedAgentIds,
    setUserInput,
    setShowHistoryPanel,
    setCurrentCommit,
    setChoices,
    setOracleThrowing,
    setOracleResult,
    setDebateRound,
    setDebateConvergence,
    setDebateBlackboard,
    setDebateMentionQueue,
    setShowAgentErrorModal,
    setAgentErrors,
    setAgentCallResults,
    setToolCallState,
    setFateContent,
    setYanMemories,
    setYanConversationId,
    setDeliberationOracle,
    setDeliberationFindings,
    setDeliberationCommitResult,
    setStreamError,
    handleRestart,
    handleDirectChoice,
    handleSelectAgent,
    handleAcceptRecommendedAgents,
    handleSubmitAnswers,
    handleSaveToCollection,
    handleRejectRetry,
    handleExecuteDebate,
    handleInterject,
    handleResume,
    handleCommitChoice,
    handleAgentClick,
    handleShowChoices,
    clearTimers,
    showFloatTip,
    PHASE,
    debugLogs,
    activeAgents,
    candidateAgents,
    phaseLabel,
    mentionMessages: debateMentionQueue,
    caseFile,
    yanQuestionRounds,
    progress,
    infoProgress,
    memoryLayers: { session: yanMemories },
    mirrorReview: null,
    debateAutoPlay,
    setDebateAutoPlay,
    fateRevealed,
    commitPending,
    arenaProjection,
    answerPending,
    processingNarrative,
    directResult,
    MAX_CLARIFY_ROUNDS: 8,
    handleUserAdvance,
    handleSkipClarify,
    handleConfirmAgents,
    handleRunAnotherRound,
    handleChoiceClick,
    handleRevealFate,
    handleProceedToChoices,
    handleSkipOracle,
    handleStartOracle,
    handleSkipToSummary,
    handleCommit,
    handleConfirmCaseFile,
    handleContinueCaseQuestions,
    handleOpenCaseFile,
    handleBackFromCaseFile: handleRestart,
    saveGameState,
    handleStart: () => handleStart(inputValue),
  };
}

export default useDeliberationFlow;
