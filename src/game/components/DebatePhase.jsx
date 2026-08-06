import { motion, AnimatePresence } from 'framer-motion';

export default function DebatePhase({
  phase,
  agentDialogues,
  activeAgentIdx,
  awaitingUser,
  debateRound,
  debateBlackboard,
  debateMentionQueue,
  selectedAgentIds,
  handleAgentClick,
}) {
  const history = agentDialogues?.history || {};
  const yanEntries = history.yan || [];
  const agentIds = Object.keys(history).filter((k) => k !== 'yan');

  const blackboardMessages = debateBlackboard?.messages || [];
  const mentions = debateMentionQueue || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col w-full h-full px-4 py-2 overflow-hidden"
      style={{ zIndex: 50 }}
    >
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs tracking-widest" style={{ color: '#C8A850' }}>
          第 {debateRound} 轮 · 诸智议事
        </span>
        {awaitingUser && (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xs"
            style={{ color: '#E8B880' }}
          >
            待你发言…
          </motion.span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-2 pb-4">
        <AnimatePresence>
          {yanEntries.map((entry, i) => (
            <motion.div
              key={`yan-${i}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="p-3 rounded-lg text-sm leading-relaxed"
              style={{
                background: 'rgba(200, 168, 80, 0.08)',
                borderLeft: '3px solid #C8A850',
                color: '#E8D8A8',
              }}
            >
              <span className="text-xs opacity-60 mr-2">【演】</span>
              {typeof entry === 'string' ? entry : (entry?.text || '')}
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {agentIds.map((agentId, idx) => {
            const entries = history[agentId] || [];
            const isActive = idx === activeAgentIdx;
            const isSelected = selectedAgentIds?.has(agentId);

            return (
              <motion.div
                key={agentId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.15, duration: 0.4 }}
                className="p-3 rounded-lg cursor-pointer transition-all duration-300"
                style={{
                  background: isActive ? 'rgba(240, 216, 144, 0.12)' : 'rgba(255,255,255,0.02)',
                  borderLeft: `3px solid ${isActive ? '#F0D890' : isSelected ? '#C88848' : '#3A3530'}`,
                  boxShadow: isActive ? '0 0 16px rgba(240, 216, 144, 0.2)' : 'none',
                }}
                onClick={() => handleAgentClick?.(agentId)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      background: isActive ? 'rgba(240, 216, 144, 0.2)' : 'rgba(200, 168, 80, 0.15)',
                      color: isActive ? '#F0D890' : '#C8A850',
                    }}
                  >
                    {agentId}
                  </span>
                  {isActive && (
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-xs"
                      style={{ color: '#F0D890' }}
                    >
                      发言中…
                    </motion.span>
                  )}
                </div>
                {entries.slice(-2).map((entry, i) => (
                  <p key={i} className="text-sm leading-relaxed" style={{ color: '#D8C8A0' }}>
                    {typeof entry === 'string' ? entry : (entry?.text || '')}
                  </p>
                ))}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {mentions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-2 rounded-lg text-xs"
            style={{
              background: 'rgba(168, 71, 46, 0.1)',
              border: '1px solid rgba(168, 71, 46, 0.3)',
              color: '#E8A890',
            }}
          >
            <span style={{ color: '#A8472E' }}>※ 言及:</span>{' '}
            {mentions.map((m) => (typeof m === 'string' ? m : m?.text || '').join(' · '))}
          </motion.div>
        )}

        {blackboardMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-2 rounded-lg text-xs"
            style={{
              background: 'rgba(200, 168, 80, 0.05)',
              border: '1px solid rgba(200, 168, 80, 0.2)',
              color: '#A89880',
            }}
          >
            <span style={{ color: '#C8A850' }}>◎ 共识板:</span>{' '}
            {blackboardMessages.slice(-3).map((m) => m?.content || m?.text || '').join(' | ')}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
