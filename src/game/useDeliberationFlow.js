import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startDeliberation,
  answerDeliberation,
  executeDeliberation,
  commitDeliberation,
  getMemories,
  probeBackend,
  setRunMode,
  getRunMode,
} from '../services/deliberationClient';
import { useDeliberationStream } from '../hooks/useDeliberationStream';
import { ensureUserId } from '../services/baseConfig';
import { _buildLocalChoices, _safeSetTimeout } from '../game/localEngine';
import { createPendingActionRegistry } from './deliberationActions';
import { sanitizeLLMText } from '../utils/helpers';
import tracker from '../services/tracker';

const PHASE = {
  IDLE: 'idle',
  CASTING: 'casting',
  SUMMONING: 'summoning',
  CLARIFY: 'clarify',
  DEBATE: 'debate',
  CHOICE: 'choice',
  REVEAL: 'reveal',
  DONE: 'done',
};

const MAX_DEBATE_ROUNDS = 3;

export function useDeliberationFlow(initialQuestion = "", textareaRef, onNavigate) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [inference, setInference] = useState(null);
  const [agentDialogues, setAgentDialogues] = useState({ history: {} });
  const [runMode, setRunModeState] = useState(getRunMode());
  const [deliberationSessionId, setDeliberationSessionId] = useState(null);
  const [deliberationOracle, setDeliberationOracle] = useState(null);
  const [deliberationFindings, setDeliberationFindings] = useState(null);
  const [deliberationCommitResult, setDeliberationCommitResult] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [awaitingUser, setAwaitingUser] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
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

  const _addDebugLog = useCallback((msg) => {
    setDebugLogs(prev => {
      const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const next = [...prev, `[${now}] ${msg}`];
      return next.slice(-30);
    });
    try { console.log(msg); } catch {}
  }, []);

  const LOG = {
    phase: (from, to) => _addDebugLog(`[PHASE] ${from} → ${to}`),
    start: (q) => _addDebugLog(`[START] question="${(q||'').slice(0,50)}"`),
    mode: (m) => _addDebugLog(`[MODE] ${m}`),
    session: (id) => _addDebugLog(`[SESSION] id=${id}`),
    choices: (arr) => _addDebugLog(`[CHOICES] ${arr?.length||0} options: ${(arr||[]).map(c=>c.id).join(',')}`),
    commit: (c) => _addDebugLog(`[COMMIT] choice=${c?.id} label="${c?.label||''}"`),
    save: (card) => _addDebugLog(`[SAVE] gua=${card?.gua} title="${card?.title||''}"`),
    error: (m, e) => _addDebugLog(`[ERROR] ${m}: ${e?.message || e}`),
  };

  const floatTipTimer = useRef(null);
  const stageTimersRef = useRef([]);
  const prevPhaseRef = useRef(phase);
  const clarifyActiveRef = useRef(false);
  const pendingActionIdsRef = useRef(createPendingActionRegistry());

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

  useDeliberationStream(deliberationSessionId, {
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
      if (data?.to) setPhase(data.to);
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

  const handleStart = useCallback(async (question) => {
    if (!question || !question.trim()) return;
    const q = question.trim();
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
      const backendAvailable = await probeBackend(3000);
      if (!backendAvailable) {
        setRunMode('LOCAL_FULL');
        setRunModeState('LOCAL_FULL');
        showFloatTip('后端不可达，已切换本地推演模式');
      } else {
        setRunMode(getRunMode());
      }
      LOG.mode(getRunMode());

      const userId = ensureUserId();
      showFloatTip('演 · 起卦中……');
      const session = await startDeliberation(q, userId);
      const sessionId = session?.sessionId || ('ls_' + Date.now().toString(36));
      setDeliberationSessionId(sessionId);

      if (session?.state === 'LOCAL_FULL' || !session?.sessionId) {
        setRunMode('LOCAL_FULL');
        setRunModeState('LOCAL_FULL');
      }

      setInference(session);
      LOG.session(sessionId);

      if (session?.memory) {
        setYanMemories(session.memory);
      }
      try {
        const mems = await getMemories(userId);
        if (mems && mems.length > 0) {
          setYanMemories(prev => [...mems, ...(prev || [])].slice(0, 20));
        }
      } catch {}

      const delay = (ms) => new Promise(r => setTimeout(r, ms));

      await delay(2500);
      setPhase(PHASE.SUMMONING);
      showFloatTip('演 · 召唤智囊……');

      const askUser = session?.askUser;
      const plan = session?.plan;
      const maxRound = session?.maxRound || MAX_DEBATE_ROUNDS;
      const currentRunMode = getRunMode();

      // === 零澄清策略：本地模式 / 后端返回的澄清问题不合理 → 直接跳过，不做任何追问 ===
      // 用户明确要求「不要预设问题、不要模板、不要垃圾的无效循环」
      const backendLooksWeak = !plan ||
        (Array.isArray(askUser) && askUser.every(q =>
          !q || !q.id || !q.question || q.question.length < 4
        ));
      if (currentRunMode === 'LOCAL_FULL' || session?.state === 'LOCAL_FULL' || backendLooksWeak) {
        if (Array.isArray(askUser) && askUser.length > 0) {
          LOG.error('skip_clarify', new Error(
            `mode=${currentRunMode} weak=${backendLooksWeak} nQ=${askUser.length} → 跳过澄清直进辩论`
          ));
        }
        setAwaitingAnswers([]);
        clarifyActiveRef.current = false;
        setAgentDialogues(prev => ({
          ...prev,
          yan: session?.openingLine || '演 · 正在思索……',
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), session?.openingLine || '演 · 正在思索……'] },
        }));
        await delay(2000);
        setPhase(PHASE.DEBATE);
        LOG.phase(phase, PHASE.DEBATE);
        setActiveAgentIdx(0);
        setAwaitingUser(true);
        showFloatTip('诸智集结，准备发言……');
        return;
      }

      if (askUser && Array.isArray(askUser) && askUser.length > 0) {
        setAwaitingAnswers(askUser);
        clarifyActiveRef.current = true;
        setPhase(PHASE.CLARIFY);
        setAwaitingUser(true);
        showFloatTip('演 · 有几个问题想请教……');
        setAgentDialogues(prev => ({
          ...prev,
          yan: session?.openingLine || '演 · 正在请教……',
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), session?.openingLine || '演 · 正在请教……'] },
        }));
        return;
      }

      setAwaitingAnswers([]);
      clarifyActiveRef.current = false;

      setAgentDialogues(prev => ({
        ...prev,
        yan: session?.openingLine || '演 · 正在思索……',
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), session?.openingLine || '演 · 正在思索……'] },
      }));

      await delay(2000);
      setPhase(PHASE.DEBATE);
      LOG.phase(phase, PHASE.DEBATE);
      setActiveAgentIdx(0);
      setAwaitingUser(true);
      showFloatTip('诸智集结，准备发言……');

    } catch (e) {
      LOG.error('handleStart', e);
      setBackendError(e.message || '推演启动失败');
      setFloatTip('推演启动失败，请重试');
      _safeSetTimeout(() => handleRestart(), 2000);
    }
  }, [showFloatTip]);

  const handleRestart = useCallback(() => {
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
      clarifyActiveRef.current = false;
      setAwaitingAnswers([]);

      if (result?.state === 'LOCAL_FULL' || !result?.sessionId) {
        setDeliberationSessionId(result?.sessionId || deliberationSessionId);
      }

      setInference(result);

      setAgentDialogues(prev => ({
        ...prev,
        yan: result?.openingLine || '演 · 诸智集结……',
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), result?.openingLine || '演 · 诸智集结……'] },
      }));

      await new Promise(r => setTimeout(r, 1500));
      setPhase(PHASE.DEBATE);
      setActiveAgentIdx(0);
      setAwaitingUser(true);
      showFloatTip('诸智集结，准备发言……');

    } catch (e) {
      LOG.error('handleSubmitAnswers', e);
      setBackendError(e.message || '提交回答失败');
      showFloatTip('提交失败，请重试');
      setAwaitingUser(true);
    }
  }, [deliberationSessionId, showFloatTip]);

  const handleSaveToCollection = useCallback(async () => {
    try {
      const realGua = inference?.gua;
      const fb = {
        gua: '大有', trigram: '☰', verse: '元亨。柔得尊位，大亨以正。', element: '火',
      };
      const guaName = realGua?.gua || fb.gua;
      const trigram = realGua?.trigram || fb.trigram;
      const choiceLabel = selectedChoice?.label || '抓住机会';

      let personalized = fateContent;
      if (!personalized || !personalized.verse) {
        personalized = {
          verse: inference?.verse || fb.verse,
          summary: inference?.summary || '',
          source: 'preset',
        };
      }

      const agentNotes = (inference?.agents || [])
        .filter(a => a && a.role !== 'master')
        .map(a => {
          const arr = inference?.agentDialogues?.history?.[a.id] || inference?.agentDialogues?.[a.id] || [];
          const last = Array.isArray(arr) ? arr[arr.length - 1] : null;
          const text = typeof last === 'string' ? last : (last?.text || '');
          return { id: a.id, name: a.name, color: a.color || '#C8A850', note: (text || '').slice(0, 80) };
        })
        .filter(a => a.note)
        .slice(0, 6);

      const pillars = (() => {
        const now = new Date();
        const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
        const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
        const pillar = (n) => stems[n % 10] + branches[n % 12];
        return {
          year: pillar(now.getFullYear() + 4),
          month: pillar(now.getMonth() + 1 + now.getFullYear()),
          day: pillar(now.getDate() + (now.getMonth() + 1) * 3),
          hour: pillar(now.getHours() + now.getDate() * 2),
        };
      })();

      const card = {
        id: `card-${Date.now()}`,
        gua: guaName,
        trigram,
        element: realGua?.element || fb.element,
        title: choiceLabel,
        question: userInput,
        decision: choiceLabel,
        style: realGua?.element ? `${realGua.element}行` : '推演命签',
        advisors: (inference?.agents || []).filter(a => a && a.role !== 'master').map(a => a.name).filter(Boolean),
        verse: personalized.verse || inference?.verse || fb.verse,
        powerfulQuestion: inference?.powerfulQuestion || '',
        framework: inference?.framework || '',
        summary: personalized.summary || inference?.summary || '此卦已入卡牌册，留作后日之镜。',
        cardSource: personalized.source,
        guaElement: realGua?.element || fb.element,
        yanSummary: inference?.summary || personalized.summary || '',
        agentNotes,
        choice: selectedChoice ? { id: selectedChoice.id, label: selectedChoice.label, icon: selectedChoice.icon } : null,
        commit: currentCommit || '',
        date: new Date().toISOString().split('T')[0],
        pillars,
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
  }, [inference, selectedChoice, userInput, fateContent, currentCommit, showFloatTip]);

  const handleRejectRetry = useCallback(async () => {
    setStreamError(null);
    setBackendError(null);
    showFloatTip('正在重试……');

    try {
      const backendAvailable = await probeBackend(2000);
      if (!backendAvailable) {
        setRunMode('LOCAL_FULL');
        setRunModeState('LOCAL_FULL');
      } else {
        setRunMode(getRunMode());
      }

      if (deliberationSessionId) {
        const actionKey = `execute-r${debateRound}`;
        const result = await executeDeliberation(deliberationSessionId, {
          actionId: pendingActionIdsRef.current.get(deliberationSessionId, actionKey),
          agentIds: Array.from(selectedAgentIds),
        });
        pendingActionIdsRef.current.complete(deliberationSessionId, actionKey);
        setDeliberationFindings(result.findings);
        setDeliberationOracle(result.oracle);
        setInference(result);
        if (result.clarifyRequired) {
          clarifyActiveRef.current = true;
          setAwaitingAnswers(result.askUser);
          setPhase(PHASE.CLARIFY);
        } else {
          setPhase(PHASE.DEBATE);
        }
        setAwaitingUser(true);
        showFloatTip('推演已恢复');
      }
    } catch (e) {
      LOG.error('handleRejectRetry', e);
      showFloatTip('重试失败，请重新开始');
    }
  }, [deliberationSessionId, debateRound, selectedAgentIds, showFloatTip]);

  const handleExecuteDebate = useCallback(async () => {
    if (!deliberationSessionId) {
      setBackendError('无有效推演会话');
      return;
    }
    try {
      showFloatTip('演 · 诸智发言中……');
      setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

      const actionKey = `execute-r${debateRound}`;
      const result = await executeDeliberation(deliberationSessionId, {
        actionId: pendingActionIdsRef.current.get(deliberationSessionId, actionKey),
        agentIds: Array.from(selectedAgentIds),
      });
      pendingActionIdsRef.current.complete(deliberationSessionId, actionKey);

      setDeliberationFindings(result.findings);
      setDeliberationOracle(result.oracle);
      setInference(result);
      if (result.clarifyRequired) {
        clarifyActiveRef.current = true;
        setAwaitingAnswers(result.askUser);
        setPhase(PHASE.CLARIFY);
      }
      setAwaitingUser(true);
      showFloatTip(null);
    } catch (e) {
      LOG.error('handleExecuteDebate', e);
      setBackendError(e.message || '推演执行失败');
      showFloatTip('推演执行失败，请重试');
      setStreamError(e.message);
    }
  }, [deliberationSessionId, debateRound, selectedAgentIds, showFloatTip]);

  const handleCommitChoice = useCallback(async (choice) => {
    if (!deliberationSessionId) return;
    try {
      setSelectedChoice(choice);
      LOG.commit(choice);
      setPhase(PHASE.REVEAL);
      showFloatTip('演 · 落卦中……');

      const result = await commitDeliberation(deliberationSessionId, {
        choice: choice?.id || choice?.label,
        commit: currentCommit,
      });

      setDeliberationCommitResult(result);
      setDeliberationOracle(result?.oracle || null);
      setFateContent(result?.fateContent || null);
      setInference(prev => prev ? { ...prev, ...result } : result);

      if (result?.summary) {
        setAgentDialogues(prev => ({
          ...prev,
          yan: result.summary,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), result.summary] },
        }));
      }
    } catch (e) {
      LOG.error('handleCommitChoice', e);
      setBackendError(e.message || '提交抉择失败');
      setShowQuestion(true);
      showFloatTip('提交失败，请重试');
    }
  }, [deliberationSessionId, currentCommit, showFloatTip]);

  const handleAgentClick = useCallback((agent) => {
    setShowHistoryPanel(true);
  }, []);

  const handleShowChoices = useCallback(() => {
    setPhase('committing');
    setAwaitingUser(false);

    const agents = inference?.agents || [];
    const dialogueMap = agentDialogues?.history || agentDialogues;
    const generatedChoices = _buildLocalChoices(userInput, agents, dialogueMap);

    setChoices(generatedChoices);
    LOG.choices(generatedChoices);
    setAgentDialogues(prev => {
      const reflectingAck = '卦已成，辞已立。\n在分岔之前，请落笔一句你的本心所向。\n不拘长短，只为后日回看。';
      return { ...prev, yan: reflectingAck, history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingAck] } };
    });
  }, [userInput, inference, agentDialogues]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase,
    inputValue,
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
    setChoices,
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
    choices,
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
    handleStart,
    handleRestart,
    handleSelectAgent,
    handleSubmitAnswers,
    handleSaveToCollection,
    handleRejectRetry,
    handleExecuteDebate,
    handleCommitChoice,
    handleAgentClick,
    handleShowChoices,
    clearTimers,
    showFloatTip,
    PHASE,
    debugLogs,
  };
}

export default useDeliberationFlow;
