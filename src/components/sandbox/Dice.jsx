import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../context/GameContext';
import { useSound } from '../../hooks/useSound';
import { DICE_CONFIG } from '../../data/endings';
import Button from '../ui/Button';

export default function Dice({ onResult }) {
  const { rollDice, setDiceRolling } = useGame();
  const { sfxDiceRoll } = useSound();
  const [face, setFace] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);

  const handleRoll = useCallback(() => {
    sfxDiceRoll();
    setDiceRolling(true);
    setRolling(true);
    setResult(null);

    let count = 0;
    const iv = setInterval(() => {
      setFace(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count > 25) {
        clearInterval(iv);
        const r = rollDice();
        setFace(r);
        setRolling(false);
        setResult(r);
        setDiceRolling(false);
        setTimeout(() => onResult?.(r), 2000);
      }
    }, 60);
  }, [rollDice, setDiceRolling, sfxDiceRoll, onResult]);

  const isGood = result !== null && result >= DICE_CONFIG.highThreshold;

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Dice */}
      <motion.div
        className="relative w-14 h-14 border-2 border-[#444] bg-[#FDFAF5] flex items-center justify-center font-mono text-2xl font-bold"
        style={{ borderRadius: '4px' }}
        animate={rolling ? {
          rotate: [0, 15, -15, 10, -10, 5, 0],
          scale: [1, 1.15, 1, 1.1, 1, 1.05, 1],
        } : result !== null ? {
          scale: [1, 1.2, 1],
        } : {}}
        transition={rolling ? { duration: 0.12, repeat: Infinity } : { duration: 0.4 }}
      >
        <span style={{ color: result !== null ? (isGood ? '#00A86B' : '#D9534F') : '#1E1E2E' }}>
          {face}
        </span>
        {result !== null && (
          <div className="absolute inset-0 pointer-events-none animate-ping" style={{
            boxShadow: `inset 0 0 20px ${isGood ? 'rgba(0,168,107,0.2)' : 'rgba(217,83,79,0.2)'}`,
            borderRadius: '4px',
          }} />
        )}
      </motion.div>

      {/* Roll button */}
      {!rolling && result === null && (
        <Button variant="gold" onClick={handleRoll}>
          🎲 投掷骰子
        </Button>
      )}

      {/* Result banner */}
      <AnimatePresence>
        {result !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center"
          >
            <div className="text-[10px] font-mono font-bold px-3 py-1 border" style={{
              color: isGood ? '#00A86B' : '#D9534F',
              borderColor: isGood ? '#00A86B' : '#D9534F',
              backgroundColor: isGood ? '#00A86B10' : '#D9534F10',
            }}>
              {isGood ? '运气加持 → 乐观分支' : '运气一般 → 注意风险'}
            </div>
            <div className="text-[8px] text-[#888] font-mono mt-1">
              {DICE_CONFIG.flavor[result]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
