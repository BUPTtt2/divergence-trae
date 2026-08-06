import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Board from '../../components/board/GameBoard';
import ProcessStepper from '../../components/board/ProcessStepper';
import { COLORS } from '../../components/board/layoutConfig';

export default function GameOverlay({
  backendError,
  setBackendError,
  floatTip,
  phase,
  showHistoryPanel,
  setShowHistoryPanel,
  deliberationSessionId,
  historyCount,
  showFloatTip,
  runMode,
  setRunMode,
  handleRestart,
  handleRejectRetry,
  BORDER_COLOR,
  GLOW_COLOR,
  RUST_COLOR,
  PAPER_COLOR,
  inference,
  activeAgents,
  activeAgentIdx,
  agentDialogues,
  selectedChoice,
  showQuestion,
  showInput,
  userInput,
}) {
  const phaseLabel = useMemo(() => {
    try {
      const agents = activeAgents || [];
      const nonMasterAgents = agents.filter(a => a.role !== 'master');
      switch (phase) {
        case 'casting': return '演 · 起卦 · 投三枚铜钱';
        case 'analyzing': return '演 · 理解问题';
        case 'summoning': return `演 · 召唤顾问 · ${nonMasterAgents.length} 位`;
        case 'agent_debate': return activeAgentIdx >= 0 ? `${nonMasterAgents[activeAgentIdx]?.name || ''} 发言中 · ${activeAgentIdx + 1}/${nonMasterAgents.length}` : '诸智集结';
        case 'reflecting': return '演 · 反思汇聚';
        case 'summary': return '演 · 梳理总结';
        case 'committing': return '演 · 落笔本心';
        case 'oracle_prompt': return '演 · 借天光否';
        case 'oracle': return '演 · 落卦中';
        case 'branch_select': return '请选择你的路径';
        case 'path_reveal': return '路径已定';
        case 'final': return '推演完成';
        default: return '';
      }
    } catch (e) {
      return '';
    }
  }, [phase, activeAgentIdx, activeAgents]);

  return (
    <>
      <div className="w-full h-full relative">
        <Board
          phase={phase}
          activeAgentIdx={activeAgentIdx}
          activeAgents={activeAgents}
          agentDialogues={agentDialogues}
          onAgentClick={() => {}}
          userInput={userInput}
          showQuestion={showQuestion}
          selectedChoice={selectedChoice}
          inference={inference}
        />
      </div>

      <ProcessStepper phase={phase} />

      <AnimatePresence>
        {phaseLabel && !showInput && phase === 'agent_debate' && activeAgentIdx >= 0 && (
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

      {historyCount > 0 && !showHistoryPanel && (
        <motion.div
          className="absolute top-4 right-4 z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button
            onClick={() => setShowHistoryPanel(true)}
            style={{
              padding: '5px 12px',
              background: 'rgba(8,8,12,0.7)',
              backdropFilter: 'blur(8px)',
              color: GLOW_COLOR,
              fontSize: '10px',
              fontFamily: '"Noto Serif SC", serif',
              border: `1px solid ${BORDER_COLOR}50`,
              letterSpacing: '0.1em',
              cursor: 'pointer',
            }}
          >
            推演记录 ({historyCount})
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {showHistoryPanel && (
          <motion.div
            className="absolute top-0 right-0 h-full w-[min(280px,85vw)] z-30"
            initial={{ x: 280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 280, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              background: 'rgba(8,8,12,0.95)',
              backdropFilter: 'blur(16px)',
              borderLeft: `1px solid ${BORDER_COLOR}40`,
            }}
          >
            <div className="p-5 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', fontSize: '14px', letterSpacing: '0.15em' }}>
                  推演记录
                </span>
                <button
                  onClick={() => setShowHistoryPanel(false)}
                  style={{ color: '#807870', fontSize: '16px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                >×</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {activeAgents.filter(a => a.role !== 'master').map(agent => {
                  const msgs = agentDialogues?.history?.[agent.id] || [];
                  if (msgs.length === 0) return null;
                  const agentColor = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
                  return (
                    <div key={agent.id} className="mb-4">
                      <div style={{
                        fontSize: '10px',
                        color: agentColor.glow,
                        fontFamily: '"Ma Shan Zheng", serif',
                        letterSpacing: '0.2em',
                        marginBottom: '4px',
                        textShadow: `0 0 6px ${agentColor.glow}80`,
                      }}>
                        {agent.name} · {agent.stance}
                      </div>
                      {msgs.map((msg, i) => (
                        <div key={i} style={{
                          fontSize: '11px',
                          color: '#E0DDD5',
                          fontFamily: '"Noto Serif SC", serif',
                          lineHeight: 1.8,
                          padding: '6px 10px',
                          borderLeft: `2px solid ${agentColor.glow}80`,
                          marginBottom: '6px',
                          background: 'rgba(255,255,255,0.03)',
                        }}>
                          {msg}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {selectedChoice && (
                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER_COLOR}40` }}>
                    <div style={{
                      fontSize: '10px',
                      color: GLOW_COLOR,
                      fontFamily: '"Ma Shan Zheng", serif',
                      letterSpacing: '0.2em',
                      marginBottom: '4px',
                    }}>
                      最终选择
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#FFF8E8',
                      fontFamily: '"Ma Shan Zheng", serif',
                      textShadow: `0 0 8px ${GLOW_COLOR}`,
                    }}>
                      {selectedChoice.label}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {floatTip && (
          <motion.div
            className="fixed left-1/2 -translate-x-1/2 z-[100] px-6 py-3"
            style={{
              bottom: 56,
              background: 'linear-gradient(135deg, #A8472E 0%, #8A3925 100%)',
              color: '#FAF6EC',
              borderRadius: 2,
              boxShadow: '0 8px 28px rgba(168,71,46,0.4)',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.2em',
              fontSize: 13,
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {floatTip}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {backendError && (
          <motion.div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[99] px-4 py-2"
            style={{
              background: 'rgba(168, 71, 46, 0.95)',
              color: '#FAF6EC',
              borderRadius: 2,
              boxShadow: '0 4px 20px rgba(168,71,46,0.5)',
              fontFamily: '"Noto Serif SC", serif',
              fontSize: '12px',
              maxWidth: '90vw',
              textAlign: 'center',
            }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>{backendError}</span>
              <button
                onClick={handleRejectRetry}
                style={{
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 2,
                  color: '#FAF6EC',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.1em',
                }}
              >
                重试
              </button>
              <button
                onClick={() => { setBackendError(null); handleRestart(); }}
                style={{
                  padding: '4px 12px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 2,
                  color: '#FAF6EC',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.1em',
                }}
              >
                重新开始
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}