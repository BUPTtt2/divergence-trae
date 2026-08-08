import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  startDeliberation,
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
import { createPendingActionRegistry } from './deliberationActions';
import { applyAgentEvent, applyTransportEvent, createArenaProjection, projectSessionSnapshot } from './agentEventProjection';
import { readStoredSseCursor } from '../services/sseStream';
import { adaptFateTicket, mapServerStateToInternalPhase } from './sandboxRuntime';
import tracker from '../services/tracker';

const PHASE = {
  IDLE: 'idle',
  CASTING: 'casting',
  SUMMONING: 'summoning',
  CLARIFY: 'clarify',
  READY: 'ready',
  DEBATE: 'debate',
  CHOICE: 'choice',
  REVEAL: 'reveal',
  DONE: 'done',
  ORACLE: 'oracle',
  BRANCH: 'branch',
  COMMITTING: 'committing',
};

const INTERNAL_TO_VIEW_PHASE = Object.freeze({
  [PHASE.IDLE]: 'input',
  [PHASE.CASTING]: 'casting',
  [PHASE.SUMMONING]: 'yan_analyze',
  [PHASE.CLARIFY]: 'clarify_loop',
  [PHASE.READY]: 'case_file_confirm',
  [PHASE.DEBATE]: 'agent_debate',
  [PHASE.CHOICE]: 'summary',
  [PHASE.ORACLE]: 'oracle',
  [PHASE.BRANCH]: 'branch_select',
  [PHASE.REVEAL]: 'path_reveal',
  [PHASE.COMMITTING]: 'committing',
  [PHASE.DONE]: 'final',
});

const VIEW_PHASE_LABEL = Object.freeze({
  input: '推演台 · 待命',
  casting: '演 · 建立会话',
  yan_analyze: '演 · 规划与召智',
  clarify_loop: '演 · 澄清关键事实',
  case_file_confirm: '案卷 · 确认后开演',
  agent_debate: '诸智 · 推演中',
  summary: '演 · 汇聚结论',
  oracle: '卦象 · 认知镜面',
  branch_select: '分岔 · 选择路径',
  path_reveal: '命签 · 待落印',
  final: '推演 · 已归档',
});

function internalPhaseForServerState(state) {
  return mapServerStateToInternalPhase(state);
}

const MAX_DEBATE_ROUNDS = 3;
const ACTIVE_SESSION_KEY = 'yance_active_deliberation_session';

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
  const commitInFlightRef = useRef(false);

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

  const _appendDialogue = useCallback((agentId, text, source, round) => {
    setAgentDialogues(prev => {
      const history = { ...(prev.history || {}) };
      const existing = history[agentId] || [];
      const entry = typeof text === 'string' ? text : { text, source, round };
      if (existing.includes(entry)) return prev;
      history[agentId] = [...existing, entry];
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
    let savedSessionId = null;
    try { savedSessionId = sessionStorage.getItem(ACTIVE_SESSION_KEY); } catch {}
    if (!savedSessionId) return undefined;

    getDeliberation(savedSessionId).then((response) => {
      const session = response?.session;
      if (cancelled || !session?.sessionId) return;
      let cursor = 0;
      try { cursor = readStoredSseCursor(localStorage, savedSessionId); } catch {}
      setArenaProjection(projectSessionSnapshot(session, { lastSequence: cursor }));
      setDeliberationSessionId(savedSessionId);
      setUserInput(session.question || '已恢复的推演');
      setInputValue(session.question || '');
      setShowInput(false);
      setShowQuestion(true);
      setPhase(internalPhaseForServerState(session.state));
      setInference(session);
      const agents = Array.isArray(session.plan?.agents) ? session.plan.agents : [];
      setPlannedAgents(agents);
      setSelectedAgentIds(new Set(agents.map((agent) => agent.id).filter(Boolean)));
      setAwaitingAnswers(Array.isArray(session.askUser) ? session.askUser : []);
      setAwaitingUser(['WAIT', 'ORACLE', 'COMPLETE'].includes(session.state));
      setChoices(Array.isArray(session.dynamicChoices) ? session.dynamicChoices : []);
      setDeliberationOracle(session.oracle || null);
      setDeliberationFindings(session.findings || null);
      setDeliberationCommitResult(session.commitResult || null);
      if (session.commitResult?.fateTicket) setFateContent(adaptFateTicket(session.commitResult.fateTicket));
    }).catch(() => {
      try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
    });

    return () => { cancelled = true; };
  }, []);

  useDeliberationStream(deliberationSessionId, {
    onEvent: (event) => {
      if (event?.type === 'CONNECTED' || event?.type === 'REPLAY_COMPLETE') {
        setArenaProjection((previous) => applyTransportEvent(previous, event));
        return;
      }
      setArenaProjection((previous) => applyAgentEvent(previous, event, {
        replay: previous.transport.replaying,
      }));
    },
    onThought: (data) => {
      setAgentDialogues(prev => ({
        ...prev,
        yan: data?.thought || prev.yan,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), data?.thought || ''] },
      }));
    },
    onAdvisorSpeak: (data) => {
      const agentId = data?.agentId;
      const content = data?.content || '';
      if (agentId && content) {
        _appendDialogue(agentId, content, 'llm');
        setAgentDialogues(prev => ({ ...prev, [agentId]: content }));
      }
    },
    onStateChange: (data) => {
      if (data?.to) setPhase(internalPhaseForServerState(data.to));
    },
    onObservation: (data) => {
      if (data?.insight) {
        setAgentDialogues(prev => ({
          ...prev,
          yan: data.insight,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), data.insight] },
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
    if (!pendingPlanSessionId || pendingPlanSessionId !== deliberationSessionId) return undefined;
    if (!arenaProjection.transport.connected) return undefined;
    let cancelled = false;

    planDeliberation(pendingPlanSessionId).then(async (session) => {
      if (cancelled || !session?.plan) return;
      setPendingPlanSessionId(null);
      setInference(session);
      const sessionAgents = Array.isArray(session.plan.agents) ? session.plan.agents : [];
      setPlannedAgents(sessionAgents);
      setSelectedAgentIds(new Set(sessionAgents.map((agent) => agent.id).filter(Boolean)));
      if (session.memory) setYanMemories(session.memory);

      try {
        const mems = await getMemories();
        if (!cancelled && mems?.length > 0) setYanMemories((previous) => [...mems, ...(previous || [])].slice(0, 20));
      } catch {}
      if (cancelled) return;

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
      if (cancelled) return;
      setPendingPlanSessionId(null);
      lastFailedActionRef.current = { type: 'start', question: userInput };
      LOG.error('planDeliberation', error);
      setBackendError(error.message || '推演规划失败');
      showFloatTip('规划失败，请重试');
      setPhase(PHASE.IDLE);
      setShowInput(true);
      setShowQuestion(false);
    });

    return () => { cancelled = true; };
  }, [pendingPlanSessionId, deliberationSessionId, arenaProjection.transport.connected, showFloatTip, LOG, userInput]);

  const handleStart = useCallback(async (question) => {
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

      showFloatTip('演 · 起卦中……');
      const session = await startDeliberation(q, { deferPlanning: true });
      if (startOperationRef.current !== operationId) return;
      if (!session?.sessionId || session?.state === 'LOCAL_FULL') {
        throw new Error('Agent Runtime 未返回有效 Session');
      }
      const sessionId = session.sessionId;
      setDeliberationSessionId(sessionId);
      try { sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId); } catch {}

      setInference(session);
      const sessionAgents = Array.isArray(session?.plan?.agents) ? session.plan.agents : [];
      setPlannedAgents(sessionAgents);
      setSelectedAgentIds(new Set(sessionAgents.map((agent) => agent.id).filter(Boolean)));
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
    setDebateRound(1);
    setDebateConvergence(null);
    setDebateBlackboard(null);
    setDebateMentionQueue([]);
    setDeliberationSessionId(null);
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
    try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
    commitInFlightRef.current = false;
    lastFailedActionRef.current = null;
  }, [clearTimers]);

  const handleSelectAgent = useCallback((id) => {
    setSelectedAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmitAnswers = useCallback(async (answers) => {
    if (!deliberationSessionId) {
      setBackendError('无有效推演会话');
      showFloatTip('推演会话已失效，请重新开始');
      return;
    }
    try {
      setAwaitingUser(false);
      showFloatTip('演 · 正在消化你的回答……');

      const result = await answerDeliberation(deliberationSessionId, answers);
      lastFailedActionRef.current = null;
      clarifyActiveRef.current = false;
      setAwaitingAnswers([]);
      setYanQuestionRounds((previous) => [
        ...previous,
        ...(Array.isArray(answers) ? answers : []).map((answer, index) => ({
          question: awaitingAnswers[index]?.question || answer?.question || '',
          userAnswer: answer?.answer || answer?.text || answer?.content || String(answer || ''),
        })),
      ]);

      setInference((previous) => ({ ...(previous || {}), ...result }));
      if (Array.isArray(result?.plan?.agents)) {
        setPlannedAgents(result.plan.agents);
        setSelectedAgentIds(new Set(result.plan.agents.map((agent) => agent.id).filter(Boolean)));
      }

      setAgentDialogues(prev => ({
        ...prev,
        yan: result?.openingLine || '演 · 诸智集结……',
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), result?.openingLine || '演 · 诸智集结……'] },
      }));

      await new Promise(r => setTimeout(r, 1500));
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

    } catch (e) {
      lastFailedActionRef.current = { type: 'answer', answers };
      LOG.error('handleSubmitAnswers', e);
      setBackendError(e.message || '提交回答失败');
      showFloatTip('提交失败，请重试');
      setAwaitingUser(true);
    }
  }, [deliberationSessionId, showFloatTip, awaitingAnswers, LOG]);

  const handleConfirmCaseFile = useCallback(async (command = {}) => {
    if (!deliberationSessionId) return;
    try {
      setAwaitingUser(false);
      showFloatTip('正在封存案卷并召集智囊……');
      const result = await confirmCaseDeliberation(deliberationSessionId, command);
      setInference((previous) => ({ ...(previous || {}), ...result }));
      setPhase(PHASE.DEBATE);
      setActiveAgentIdx(0);
      setAwaitingUser(true);
      showFloatTip('案卷已确认，诸智开始推演');
    } catch (error) {
      setBackendError(error.message || '案卷确认失败');
      setAwaitingUser(true);
      showFloatTip('案卷确认失败，请重试');
    }
  }, [deliberationSessionId, showFloatTip]);

  const handleSaveToCollection = useCallback(async () => {
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
        id: ticket.ticketId,
        gua: guaName,
        trigram: selectedChoice?.icon || '☯',
        element: '',
        title: choiceLabel,
        question: ticket.question,
        decision: choiceLabel,
        style: 'Session 命签',
        advisors: agentNotes.map((note) => note.name).filter(Boolean),
        verse: ticket.oracleText || '',
        summary: agentNotes.map((note) => note.note).filter(Boolean).join('；'),
        cardSource: 'deliberation_session',
        yanSummary: inference?.masterSummary || '',
        agentNotes,
        choice: selectedChoice ? { id: selectedChoice.id, label: selectedChoice.label, icon: selectedChoice.icon } : null,
        commit: ticket.feedback || currentCommit || '',
        date: new Date(ticket.timestamp || Date.now()).toISOString().split('T')[0],
        hasAchievement: false,
      };

      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      saved.unshift(card);
      localStorage.setItem('yance_collection', JSON.stringify(saved));
      LOG.save(card);

      showFloatTip(`命签「${card.gua} · ${card.title}」已入卡牌册`);
    } catch (e) {
      LOG.error('handleSaveToCollection', e);
      showFloatTip('保存失败，请重试');
    }
  }, [deliberationCommitResult, inference, selectedChoice, currentCommit, showFloatTip, LOG]);

  const handleExecuteDebate = useCallback(async (roundOverride = debateRound, agentIdsOverride = null) => {
    if (!deliberationSessionId) {
      setBackendError('无有效推演会话');
      return;
    }
    const requestedAgentIds = Array.isArray(agentIdsOverride)
      ? agentIdsOverride
      : Array.from(selectedAgentIds);
    try {
      showFloatTip('演 · 诸智发言中……');
      setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

      const actionKey = `execute-r${roundOverride}`;
      const result = await executeDeliberation(deliberationSessionId, {
        actionId: pendingActionIdsRef.current.get(deliberationSessionId, actionKey),
        agentIds: requestedAgentIds,
      });
      pendingActionIdsRef.current.complete(deliberationSessionId, actionKey);
      lastFailedActionRef.current = null;

      setDeliberationFindings(result.findings);
      setDeliberationOracle(result.oracle);
      setInference((previous) => ({ ...(previous || {}), ...result }));
      if (result.clarifyRequired || result.state === 'CLARIFY') {
        clarifyActiveRef.current = true;
        setAwaitingAnswers(result.askUser);
        setPhase(PHASE.CLARIFY);
      } else if (result.state === 'READY') {
        setPhase(PHASE.READY);
        showFloatTip('你的纠正已收到，请重新确认案卷');
      } else if (result.state === 'PAUSED') {
        setIsPaused(true);
        setAwaitingUser(true);
        showFloatTip('推演已暂停，你可以继续补充后再开演');
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
      };
      LOG.error('handleExecuteDebate', e);
      setBackendError(e.message || '推演执行失败');
      showFloatTip('推演执行失败，请重试');
      setStreamError(e.message);
    }
  }, [deliberationSessionId, debateRound, selectedAgentIds, showFloatTip, plannedAgents, LOG]);

  const handleInterject = useCallback(async (commandType = 'SUPPLEMENT') => {
    if (!deliberationSessionId) return;
    const content = String(currentResponse || '').trim();
    if (commandType !== 'PAUSE' && !content) {
      showFloatTip('先写下你要补充、纠正或追问的内容');
      return;
    }
    try {
      await interjectDeliberation(deliberationSessionId, { commandType, content });
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
        SUPPLEMENT: '补充已进入推演上下文',
        CORRECTION: '纠正已提交，Agent 将停下并重整案卷',
        QUESTION: '追问已交给智囊团',
        PAUSE: '暂停指令已提交',
      }[commandType] || '已提交';
      showFloatTip(message);
    } catch (error) {
      setBackendError(error.message || '提交失败');
      showFloatTip('提交失败，请重试');
    }
  }, [currentResponse, deliberationSessionId, showFloatTip]);

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
      const answer = String(currentResponse || '').trim();
      if (!answer) {
        showFloatTip('请先回答，或选择跳过澄清');
        return;
      }
      setCurrentResponse('');
      return handleSubmitAnswers(awaitingAnswers.map((item) => ({
        question: item.question,
        answer,
      })));
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
    awaitingAnswers,
    fateRevealed,
    selectedChoice,
    handleStart,
    handleSubmitAnswers,
    handleExecuteDebate,
    handleInterject,
    handleShowChoices,
    showFloatTip,
  ]);

  const handleSkipClarify = useCallback(async () => {
    const skipped = awaitingAnswers.map((item) => ({
      question: item.question,
      answer: '用户选择跳过本项澄清',
    }));
    return handleSubmitAnswers(skipped.length > 0 ? skipped : [{ answer: '用户选择跳过澄清' }]);
  }, [awaitingAnswers, handleSubmitAnswers]);

  const handleConfirmAgents = useCallback(() => handleExecuteDebate(), [handleExecuteDebate]);

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
    return handleExecuteDebate();
  }, [inference, handleExecuteDebate]);

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
      return handleExecuteDebate(failed.round, failed.agentIds || []);
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

  const activeAgents = useMemo(() => plannedAgents, [plannedAgents]);
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
    handleSelectAgent,
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
    MAX_CLARIFY_ROUNDS: 2,
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
    handleBackFromCaseFile: handleRestart,
    saveGameState,
    handleStart: () => handleStart(inputValue),
  };
}

export default useDeliberationFlow;
