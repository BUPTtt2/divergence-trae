import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../context/GameContext';

export default function DecisionLog() {
  const { state } = useGame();
  const { log } = state;

  const formatTime = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  };

  return (
    <div>
      <div className="terminal-header">决策日志</div>
      <div className="h-[120px] overflow-y-auto text-[9px] font-mono text-[#666] space-y-1">
        <AnimatePresence>
          {log.map((entry, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-1"
            >
              <span className="text-retro-green">[{formatTime(entry.time)}]</span>
              <span className="text-[#888]">&gt;</span>
              <span>{entry.action}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {log.length === 0 && <div className="text-[#aaa] italic">等待操作...</div>}
      </div>
    </div>
  );
}
