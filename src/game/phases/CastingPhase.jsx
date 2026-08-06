import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentDialogueOverlay from '../../components/board/AgentDialogueOverlay';
import { getAgentsForQuestion, detectQuestionType } from '../../data/agents';
import { getCustomAgents, recommendSubscribedAgents } from '../../utils/customAgent';
import { generateDialoguesForAgents, judgeContinueAsking, isLlmAvailable } from '../../services/inferenceEngine';
import { detectConvergenceFromBlackboard } from '../../services/multiAgentFramework';
import { saveAgentFeedback } from '../../services/memoryStore';

export default function CastingPhase({
  phase,
  inference,
  agentDialogues,
  activeAgents,
  selectedAgentIds,
  handleSelectAgent,
  handleStart,
  setInputValue,
  inputValue,
  textareaRef,
  floatTip,
  showFloatTip,
  runMode,
  BORDER_COLOR,
  GLOW_COLOR,
  PAPER_COLOR,
  RUST_COLOR,
  userInput,
  showInput,
  awaitingUser,
  currentResponse,
  setCurrentResponse,
  handleUserAdvance,
  agentCallResults,
  debateConvergence,
  mentions,
  toolCallState,
  setShowInput,
  setPhase,
  setAwaitingUser,
  setSelectedAgentIds,
  setAgentDialogues,
  setInference,
  setActiveAgentIdx,
  setCurrentResponse: _setCurrentResponse,
  setFloatTip: _setFloatTip,
  setHistoryCount,
  setToolCallState,
  setAgentCallResults,
  setDebateRound,
  setDebateConvergence,
  setDebateBlackboard,
  setDebateMentionQueue,
  setBackendError,
  clearTimers,
  showQuestion,
  setShowQuestion,
  activeAgentIdx,
  debateRound,
  MAX_DEBATE_ROUNDS,
  setAgentErrors,
  setShowAgentErrorModal,
  stageTimersRef,
  debateBlackboardRef,
  debateMentionQueueRef,
}) {
  const computedAgents = useMemo(() => {
    try {
      if (!userInput) return [];
      const presetAgents = getAgentsForQuestion(userInput) || [];
      const customAgentsList = getCustomAgents();
      const allAgents = [...presetAgents, ...customAgentsList];
      if ((phase === 'agent_debate' || phase === 'reflecting' || phase === 'summary' || phase === 'committing' || phase === 'final') && inference?.agents) {
        return inference.agents;
      }
      return allAgents;
    } catch (e) {
      console.warn('[activeAgents] 生成失败:', e);
      return [];
    }
  }, [userInput, phase, inference]);

  const agents = activeAgents || computedAgents;

  return (
    <>
      <AnimatePresence>
        {phase === 'casting' && (
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
            style={{ marginTop: '120px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div style={{
              color: GLOW_COLOR,
              fontSize: '12px',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.3em',
              textShadow: `0 0 10px ${GLOW_COLOR}`,
              opacity: 0.85,
            }}>
              投三枚铜钱,立此一卦……
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AgentDialogueOverlay
        phase={phase}
        question={userInput}
        activeAgentIdx={activeAgentIdx}
        activeAgents={agents}
        agentDialogues={agentDialogues}
        selectedAgentIds={selectedAgentIds}
        onAgentToggle={(id) => setSelectedAgentIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        onConfirmAgents={async () => {
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

          const toolCallbacks = {
            onToolStart: (agentId, tools) => {
              setToolCallState({ agentId, tools, currentTool: null, results: [], status: 'calling' });
            },
            onToolCall: (agentId, tool, params) => {
              setToolCallState(prev => prev.agentId === agentId
                ? { ...prev, currentTool: tool, status: 'calling' }
                : prev);
            },
            onToolResult: (agentId, tool, summary, status) => {
              setToolCallState(prev => prev.agentId === agentId
                ? { ...prev, results: [...prev.results, { tool, summary, status }] }
                : prev);
            },
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
        }}
        awaitingUser={awaitingUser}
        currentResponse={currentResponse}
        setCurrentResponse={_setCurrentResponse}
        onUserAdvance={handleUserAdvance}
        agentCallResults={agentCallResults}
        onFeedback={(agentId, feedbackType, dialogue) => {
          saveAgentFeedback(agentId, feedbackType, userInput, dialogue);
        }}
        debateConvergence={debateConvergence}
        mentions={mentions}
        toolCallState={toolCallState}
      />

      <AnimatePresence>
        {showInput && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <div className="p-7" style={{ backgroundColor: 'rgba(8,8,12,0.95)', border: `1px solid ${BORDER_COLOR}`, boxShadow: `0 0 40px ${GLOW_COLOR}20` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 flex items-center justify-center text-[14px]" style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', border: `1px solid ${BORDER_COLOR}`, textShadow: `0 0 8px ${GLOW_COLOR}` }}>演</div>
                  <div className="flex flex-col leading-none">
                    <span className="text-base" style={{ color: '#FFF8E8', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>推演台</span>
                    <span className="text-[8px] tracking-[0.2em] mt-1" style={{ color: '#807870' }}>YAN · SANDBOX</span>
                  </div>
                </div>
                <p className="text-[11px] mb-5 mt-3" style={{ color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}>
                  写下你正在纠结的抉择，系统将立卦推演，诸智各抒己见。
                </p>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.slice(0, 500))}
                  placeholder="例如：要不要接那个新 Offer？"
                  maxLength={500}
                  className="w-full h-20 p-3 text-xs resize-none focus:outline-none"
                  style={{ border: `1px solid ${BORDER_COLOR}40`, backgroundColor: 'rgba(255,255,255,0.03)', color: '#F0EDE5', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}
                  onKeyDown={(e) => {
                    // B2 + C4 Fix: 直接用原生 event.isComposing 判断中文输入法合成期
                    // 合成期回车不触发提交，完全不用 useState 避免 hooks 条件挂载报错
                    if (e.key === 'Enter' && !e.shiftKey) {
                      if (e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      handleStart();
                    }
                  }}
                />
                <button
                  onClick={handleStart}
                  disabled={!inputValue.trim()}
                  className="w-full mt-4 py-3 text-sm transition-all"
                  style={{
                    background: inputValue.trim() ? `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})` : 'rgba(255,255,255,0.05)',
                    color: '#1A1410',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: `1px solid ${BORDER_COLOR}`,
                    cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                    opacity: inputValue.trim() ? 1 : 0.5,
                    boxShadow: inputValue.trim() ? `0 0 20px ${GLOW_COLOR}40` : 'none',
                  }}
                >
                  立卦开演
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}