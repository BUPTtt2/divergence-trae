import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentDialogueOverlay from '../../components/board/AgentDialogueOverlay';
import { detectQuestionType } from '../../data/agents';
import { generateDialoguesForAgents, judgeContinueAsking, generateYanSummary, saveAgentFeedback } from '../../services/inferenceEngine';
import { detectConvergenceFromBlackboard } from '../../services/multiAgentFramework';
import { COLORS } from '../../components/board/layoutConfig';
import { getCustomAgents } from '../../utils/customAgent';

export default function DebatePhase({
  phase,
  inference,
  agentDialogues,
  activeAgents,
  awaitingAnswers,
  debateRound,
  debateBlackboard,
  debateMentionQueue,
  toolCallState,
  oracleResult,
  oracleThrowing,
  awaitingUser,
  showAgentErrorModal,
  agentErrors,
  agentCallResults,
  setOracleResult,
  setOracleThrowing,
  setDebateRound,
  setDebateConvergence,
  setDebateBlackboard,
  setDebateMentionQueue,
  setToolCallState,
  setShowAgentErrorModal,
  setAgentErrors,
  setAgentCallResults,
  BORDER_COLOR,
  GLOW_COLOR,
  PAPER_COLOR,
  RUST_COLOR,
  userInput,
  showQuestion,
  selectedAgentIds,
  setSelectedAgentIds,
  setPhase,
  setAwaitingUser,
  setAgentDialogues,
  setInference,
  setActiveAgentIdx,
  setCurrentResponse,
  setFloatTip,
  setHistoryCount,
  activeAgentIdx,
  currentResponse,
  handleUserAdvance,
  MAX_DEBATE_ROUNDS,
  showFloatTip,
  setBackendError,
  clearTimers,
  stageTimersRef,
  debateBlackboardRef,
  debateMentionQueueRef,
  setShowQuestion,
  setCurrentCommit,
  setYanConversationId,
  yanConversationId,
  setYanMemories,
  setDeliberationOracle,
  setDeliberationFindings,
  setDeliberationCommitResult,
  setStreamError,
  handleSaveToCollection,
  handleRestart,
  handleRejectRetry,
  handleCommitChoice,
  handleShowChoices,
  handleAgentClick,
  streamError,
}) {
  const mentionMessages = useMemo(() => {
    const msgs = debateBlackboardRef.current?.messages;
    if (!Array.isArray(msgs)) return [];
    return msgs.filter(m => m && (m.isMention || m.refusalReason));
  }, [debateRound, phase, agentDialogues]);

  const phaseLabel = useMemo(() => {
    try {
      const agents = activeAgents || [];
      const nonMasterAgents = agents.filter(a => a.role !== 'master');
      switch (phase) {
        case 'yan_analyze': return '演 · 理解问题';
        case 'agent_select': return `演 · 召唤顾问 · ${nonMasterAgents.length} 位`;
        case 'agent_debate': return activeAgentIdx >= 0 ? `${nonMasterAgents[activeAgentIdx]?.name || ''} 发言中 · ${activeAgentIdx + 1}/${nonMasterAgents.length}` : '诸智集结';
        case 'reflecting': return '演 · 反思汇聚';
        case 'summary': return '演 · 梳理总结';
        default: return '';
      }
    } catch (e) {
      return '';
    }
  }, [phase, activeAgentIdx, activeAgents]);

  const toolCallbacks = useMemo(() => ({
    onToolStart: (agentId, tools) => {
      setToolCallState({ agentId, tools, currentTool: null, results: [], status: 'calling' });
    },
    onToolCall: (agentId, tool) => {
      setToolCallState(prev => prev.agentId === agentId
        ? { ...prev, currentTool: tool, status: 'calling' }
        : prev);
    },
    onToolResult: (agentId, tool, summary, status) => {
      setToolCallState(prev => prev.agentId === agentId
        ? { ...prev, results: [...prev.results, { tool, summary, status }] }
        : prev);
    },
  }), [setToolCallState]);

  const handleConfirmAgents = useCallback(async () => {
    if (!inference) return;
    const customAgentsList = getCustomAgents();
    const allAgentsList = [...(inference.agents || []), ...customAgentsList];
    const selected = allAgentsList.filter(a => selectedAgentIds.has(a.id));
    if (selected.length === 0) {
      showFloatTip('请至少选择一位智囊');
      return;
    }
    setInference(prev => prev ? { ...prev, agents: selected } : { agents: selected });
    setAwaitingUser(false);

    clearTimers();
    setPhase('agent_debate');
    setActiveAgentIdx(0);
    showFloatTip('智囊正在斟酌发言…');

    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    let hasErrors = false;
    let allErrors = {};

    setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      newDialogues[agentId] = text;
      callResults[agentId] = { success, error, source, collaboration };
      if (!success) {
        hasErrors = true;
        allErrors[agentId] = { agentName: selected.find(a => a.id === agentId)?.name || agentId, error: error || '未知错误' };
      }
      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
      setToolCallState(prev => prev.agentId === agentId ? { ...prev, status: 'done' } : prev);
    };

    const onError = (errors) => {
      setAgentErrors(errors);
      setShowAgentErrorModal(true);
    };

    const result = await generateDialoguesForAgents(question, selected, qType, onAgentComplete, onError, inference.userContext, { round: 1, toolCallbacks });
    setAgentCallResults(callResults);

    if (result.blackboard) {
      debateBlackboardRef.current = result.blackboard;
      debateMentionQueueRef.current = result.mentionQueue || [];
      setDebateBlackboard(result.blackboard);
      setDebateMentionQueue(result.mentionQueue || []);
      const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: 1 });
      setDebateRound(1);
      setDebateConvergence(convergence);
    }

    if (hasErrors && Object.keys(allErrors).length > 0) {
      setAgentErrors(allErrors);
      setShowAgentErrorModal(true);
    }

    showFloatTip(null);

    const firstDialogue = newDialogues[selected[0].id] || '...';
    setAgentDialogues(prev => {
      const history = { ...(prev.history || {}) };
      const existing = history[selected[0].id] || [];
      if (existing.includes(firstDialogue)) return prev;
      history[selected[0].id] = [...existing, { text: firstDialogue, source: callResults[selected[0].id]?.source || 'preset' }];
      return { ...prev, [selected[0].id]: firstDialogue, history };
    });
    setAwaitingUser(true);
  }, [inference, selectedAgentIds, userInput, clearTimers, toolCallbacks, showFloatTip,
      setInference, setAwaitingUser, setPhase, setActiveAgentIdx, setToolCallState,
      setAgentCallResults, setDebateBlackboard, setDebateMentionQueue, setDebateRound,
      setDebateConvergence, setAgentErrors, setShowAgentErrorModal, setAgentDialogues]);

  const handleRunAnotherRound = useCallback(async () => {
    if (!inference || !inference.agents) return;
    const selected = inference.agents;
    const nextRound = debateRound + 1;
    if (nextRound > MAX_DEBATE_ROUNDS) return;

    setAwaitingUser(false);
    setActiveAgentIdx(0);
    showFloatTip(`第 ${nextRound} 轮辩论中…`);

    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    const existingBlackboard = debateBlackboardRef.current;
    const existingMentionQueue = debateMentionQueueRef.current;

    setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      newDialogues[agentId] = text;
      callResults[agentId] = { success, error, source, collaboration };
      setInference(prev => prev ? { ...prev, agentDialogues: { ...(prev.agentDialogues || {}), [agentId]: text } } : prev);
      setToolCallState(prev => prev.agentId === agentId ? { ...prev, status: 'done' } : prev);
    };

    const result = await generateDialoguesForAgents(
      question, selected, qType, onAgentComplete, undefined, inference.userContext,
      { existingBlackboard, existingMentionQueue, round: nextRound, toolCallbacks }
    );
    setAgentCallResults(prev => ({ ...prev, ...callResults }));

    if (result.blackboard) {
      debateBlackboardRef.current = result.blackboard;
      debateMentionQueueRef.current = result.mentionQueue || [];
      setDebateBlackboard(result.blackboard);
      setDebateMentionQueue(result.mentionQueue || []);
      const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: nextRound });
      setDebateRound(nextRound);
      setDebateConvergence(convergence);
    }

    const firstId = selected[0]?.id;
    if (firstId && newDialogues[firstId]) {
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        for (const a of selected) {
          const t = newDialogues[a.id];
          if (t) {
            const arr = history[a.id] || [];
            history[a.id] = [...arr, { text: t, source: callResults[a.id]?.source || 'preset', round: nextRound }];
          }
        }
        return { ...prev, [firstId]: newDialogues[firstId], history };
      });
    }

    showFloatTip(null);
    setAwaitingUser(true);
  }, [inference, userInput, debateRound, toolCallbacks, showFloatTip, MAX_DEBATE_ROUNDS,
      setAwaitingUser, setActiveAgentIdx, setToolCallState, setAgentCallResults,
      setDebateBlackboard, setDebateMentionQueue, setDebateRound, setDebateConvergence,
      setAgentDialogues, setInference]);

  return (
    <>
      <AnimatePresence>
        {phase === 'reflecting' && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ marginTop: '120px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div style={{
              color: GLOW_COLOR,
              fontSize: '11px',
              fontFamily: '"Noto Serif SC", serif',
              letterSpacing: '0.3em',
              textShadow: `0 0 8px ${GLOW_COLOR}`,
              opacity: 0.8,
            }}>
              演 · 反思汇聚中……
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phaseLabel && phase === 'agent_debate' && activeAgentIdx >= 0 && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 z-20"
            style={{ top: '92px' }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div style={{
              padding: '4px 14px',
              background: 'rgba(8,8,12,0.7)',
              backdropFilter: 'blur(8px)',
              color: GLOW_COLOR,
              fontSize: '10px',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.25em',
              border: `1px solid ${BORDER_COLOR}40`,
            }}>
              {phaseLabel}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentDialogueOverlay
        phase={phase}
        question={userInput}
        activeAgentIdx={activeAgentIdx}
        activeAgents={activeAgents}
        agentDialogues={agentDialogues}
        selectedAgentIds={selectedAgentIds}
        onAgentToggle={(id) => setSelectedAgentIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        onConfirmAgents={handleConfirmAgents}
        awaitingUser={awaitingUser}
        currentResponse={currentResponse}
        setCurrentResponse={setCurrentResponse}
        onUserAdvance={handleUserAdvance}
        agentCallResults={agentCallResults}
        onFeedback={(agentId, feedbackType, dialogue) => {
          saveAgentFeedback(agentId, feedbackType, userInput, dialogue);
        }}
        debateConvergence={debateBlackboard?.convergence}
        mentions={mentionMessages}
        toolCallState={toolCallState}
      />

      {phase === 'agent_debate' && debateBlackboard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
            padding: '4px 14px', background: 'rgba(10,10,15,0.6)', borderRadius: '14px',
            border: '1px solid #C8A85030', zIndex: 25,
          }}
        >
          <span style={{ color: debateBlackboard.converged ? '#80C8A8' : '#F0D890', fontSize: '11px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
            {debateBlackboard.converged
              ? `第${debateRound}轮已收敛 · ${debateBlackboard.reason === 'consensus' ? '共识达成' : '循环停止'}`
              : `第${debateRound}轮 · 共识度 ${(debateBlackboard.consensusScore ?? 0.5).toFixed(2)}`}
          </span>
        </motion.div>
      )}

      <AnimatePresence>
        {awaitingUser && (phase === 'yan_analyze' || phase === 'agent_debate' || phase === 'summary') && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
            style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {(phase === 'yan_analyze' || phase === 'agent_debate') && (
              <div className="w-full mb-2 flex items-center gap-2">
                <input
                  type="text"
                  value={currentResponse}
                  onChange={(e) => setCurrentResponse(e.target.value.slice(0, 120))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleUserAdvance();
                    }
                  }}
                  placeholder={phase === 'yan_analyze' ? '回答演的问题，帮助智囊团更好分析...' : '可以补充信息,也可留空直接翻牌'}
                  maxLength={120}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'rgba(8,8,12,0.7)',
                    backdropFilter: 'blur(8px)',
                    color: '#F0EBDD',
                    fontSize: '11px',
                    fontFamily: '"Noto Serif SC", serif',
                    border: `1px solid ${BORDER_COLOR}40`,
                    outline: 'none',
                    letterSpacing: '0.05em',
                  }}
                />
              </div>
            )}

            <button
              onClick={phase === 'summary' ? handleShowChoices : handleUserAdvance}
              style={{
                padding: '12px 36px',
                background: 'rgba(8,8,12,0.85)',
                backdropFilter: 'blur(10px)',
                color: GLOW_COLOR,
                fontSize: '13px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.3em',
                border: `1px solid ${BORDER_COLOR}`,
                cursor: 'pointer',
                boxShadow: `0 0 24px ${GLOW_COLOR}40`,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 32px ${GLOW_COLOR}80`;
                e.currentTarget.style.background = 'rgba(8,8,12,0.95)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 0 24px ${GLOW_COLOR}40`;
                e.currentTarget.style.background = 'rgba(8,8,12,0.85)';
              }}
            >
              {phase === 'yan_analyze' ? '召唤智囊' : phase === 'summary' ? '看分岔 · 抉择' : (activeAgentIdx < activeAgents.filter(a => a.role !== 'master').length - 1 ? '下一位发言' : '请演总结')}
              <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
            </button>

            {phase === 'agent_debate' && debateBlackboard && !debateBlackboard.converged && debateRound < MAX_DEBATE_ROUNDS && activeAgentIdx >= activeAgents.filter(a => a.role !== 'master').length - 1 && (
              <motion.button
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                onClick={handleRunAnotherRound}
                style={{
                  marginTop: '12px',
                  padding: '6px 18px',
                  background: 'transparent',
                  color: '#F0D890',
                  fontSize: '11px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.25em',
                  border: `1px solid ${BORDER_COLOR}60`,
                  borderRadius: 2,
                  cursor: 'pointer',
                  opacity: 0.85,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = GLOW_COLOR; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.borderColor = `${BORDER_COLOR}60`; }}
                title={`共识度 ${(debateBlackboard.consensusScore ?? 0.5).toFixed(2)}，可让智囊再深入辩一轮`}
              >
                ⟳ 再辩一轮 · 第 {debateRound + 1} 轮
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAgentErrorModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{
                background: 'rgba(15,12,8,0.98)',
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: 4,
                padding: '24px',
                boxShadow: `0 0 40px ${GLOW_COLOR}20`,
              }}
            >
              <div style={{ fontSize: '16px', color: '#E88080', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em', marginBottom: '16px', textAlign: 'center' }}>
                智囊发言异常
              </div>
              <div style={{ fontSize: '12px', color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', marginBottom: '16px', lineHeight: 1.8 }}>
                以下智囊未能连接到AI生成真实回答，使用了预设模板：
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {Object.entries(agentErrors).map(([agentId, error]) => (
                  <div key={agentId} style={{
                    padding: '10px 12px',
                    background: 'rgba(168,64,64,0.1)',
                    border: '1px solid #A8404040',
                    borderRadius: 2,
                  }}>
                    <div style={{ color: '#E88080', fontSize: '13px', fontWeight: 600 }}>{error.agentName}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>{error.error}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowAgentErrorModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(60,55,50,0.5)',
                    border: `1px solid ${BORDER_COLOR}40`,
                    borderRadius: 2,
                    color: '#A0A0A0',
                    fontSize: '12px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  跳过，继续推演
                </button>
                <button
                  onClick={() => {
                    setShowAgentErrorModal(false);
                    const question = userInput;
                    const qType = detectQuestionType(question);
                    const agents = inference?.agents || [];
                    const newDialogues = {};
                    const callResults = {};
                    showFloatTip('正在重试...');
                    const onAgentComplete = (agentId, text, success, error, source) => {
                      newDialogues[agentId] = text;
                      callResults[agentId] = { success, error, source };
                      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
                    };
                    generateDialoguesForAgents(question, agents, qType, onAgentComplete).then(() => {
                      showFloatTip(null);
                      setAgentCallResults(callResults);
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})`,
                    border: 'none',
                    borderRadius: 2,
                    color: '#1A1410',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  重试连接
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}