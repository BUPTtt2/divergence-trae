import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../../context/GameContext';
import { useSound } from '../../hooks/useSound';
import Button from '../ui/Button';

export default function FateCard() {
  const { state, resetGame, getProgress } = useGame();
  const { fateCard, diceResult, choices, pathHistory, userInput, agentOpinions } = state;
  const { sfxFateReveal, sfxAchievement } = useSound();

  const isAccept = fateCard?.id === 'fate_accept';
  const optimisticPath = pathHistory.includes('crossroad_opt');

  let decisionStyle = '稳健型';
  if (fateCard && isAccept && optimisticPath) decisionStyle = '机会型 — 在乐观信号下果断出手';
  else if (fateCard && isAccept && !optimisticPath) decisionStyle = '冒险型 — 在悲观信号下依然选择接受';
  else if (fateCard && !isAccept && optimisticPath) decisionStyle = '谨慎型 — 在乐观信号下选择保守';

  let showBonus = false;
  if (fateCard && isAccept && pathHistory.includes('crossroad_pess')) showBonus = true;
  if (fateCard && !isAccept && pathHistory.includes('crossroad_opt')) showBonus = true;

  useEffect(() => {
    if (!fateCard) return;
    sfxFateReveal();
    if (showBonus) setTimeout(sfxAchievement, 2000);
  }, [fateCard, showBonus]);

  if (!fateCard) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-terminal/80" />

      {/* Card */}
      <motion.div
        className="relative z-10 w-[360px] bg-paper border-3 border-terminal-gray font-mono overflow-hidden"
        style={{ border: '3px solid #1A1A1A' }}
        initial={{ rotateY: 180, scale: 0.8 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 100 }}
      >
        {/* Inner border */}
        <div className="m-1 p-4 border border-[#D4A017]/50">
          {/* Stamp */}
          <motion.div
            className="absolute top-6 right-6 text-[10px] font-bold text-risk-red/70 border border-risk-red/40 px-2 py-0.5"
            initial={{ scale: 3, rotate: -15, opacity: 0 }}
            animate={{ scale: 1, rotate: -3, opacity: 1 }}
            transition={{ delay: 0.8, type: 'spring' }}
          >
            推演完成
          </motion.div>

          {/* Title */}
          <h2 className="text-sm font-bold text-terminal mb-1">{fateCard.title}</h2>
          <div className="text-[8px] text-[#888] mb-3">决策：{userInput}</div>

          {/* Divider */}
          <div className="border-t border-dashed border-[#ccc] my-3" />

          {/* Summary */}
          <div className="text-[11px] text-[#444] leading-relaxed mb-3 whitespace-pre-line">
            {fateCard.summary.join('\n')}
          </div>

          {/* Stats */}
          <div className="space-y-2 mb-3">
            {fateCard.stats.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[9px] text-[#888] w-14">{s.label}</span>
                <div className="flex-1 h-2 bg-[#ddd]">
                  <motion.div
                    className="h-full bg-retro-green"
                    initial={{ width: 0 }}
                    animate={{ width: `${(s.value / s.max) * 100}%` }}
                    transition={{ delay: 0.5 + i * 0.2, duration: 0.8 }}
                  />
                </div>
                <span className="text-[8px] text-[#666]">{s.value}/{s.max}</span>
              </div>
            ))}
          </div>

          {/* Decision style */}
          <div className="text-[9px] text-[#666] mb-2">你的决策风格：{decisionStyle}</div>

          {/* Epilogue */}
          <div className="border-t border-dashed border-[#ccc] pt-2 mb-3">
            <div className="text-[10px] text-[#888] italic">{fateCard.epilogue}</div>
          </div>

          {/* Achievement */}
          {showBonus && (
            <motion.div
              className="border border-dashed border-gold/50 p-2 mb-3 text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 2 }}
            >
              <div className="text-[8px] text-gold mb-1">HIDDEN ACHIEVEMENT</div>
              <div className="text-[10px] text-gold font-bold">{fateCard.bonus}</div>
            </motion.div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 mt-4">
            <Button variant="primary" onClick={resetGame}>重新推演</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
