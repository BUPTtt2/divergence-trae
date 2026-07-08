import { motion } from 'framer-motion';
import { useGame } from '../../context/GameContext';

/* 顶栏 - 水墨风, 当 GameContext 无 phase 时自动隐藏 */
export default function TopBar() {
  const { state, getProgress } = useGame();
  const { phase, luckState } = state;
  const progress = getProgress();

  // idle 时隐藏 (Game.jsx 用本地 state 管理, 不驱动 context)
  if (phase === 'idle') return null;

  const phaseLabels = {
    input: '听你倾诉', analyzing: '立卦中', summoning: '召智囊',
    agent_debate: '智囊辩论', summary: '梳理总结', branch_select: '抉择时',
    path_reveal: '推演路径', fate_reveal: '命运揭示', done: '推演完成',
  };
  const luckColors = { optimistic: '#A8472E', pessimistic: '#5A4A3A', neutral: '#7A7468' };
  const luckLabels = { optimistic: '阳明', pessimistic: '阴沉', neutral: '中和' };

  return (
    <div
      className="h-10 flex items-center px-4 text-[11px] gap-3 shrink-0"
      style={{
        backgroundColor: '#FAF6EC',
        borderBottom: '1px solid rgba(168, 71, 46, 0.2)',
        color: '#7A7468',
        fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
        letterSpacing: '0.1em',
      }}
    >
      <span style={{ color: '#A8472E', fontWeight: 700, fontSize: 13, letterSpacing: '0.25em' }}>推演局</span>
      <span style={{ color: 'rgba(168, 71, 46, 0.3)' }}>│</span>
      <span style={{ color: phase === 'done' ? '#7A7468' : '#A8472E', fontWeight: 700 }}>
        {phase === 'done' ? '已成' : '演中'}
      </span>
      <span style={{ color: 'rgba(168, 71, 46, 0.3)' }}>│</span>
      <span>{phaseLabels[phase] || phase}</span>
      <div className="flex items-center gap-2 ml-2">
        <div
          className="w-32 h-1.5 overflow-hidden"
          style={{ backgroundColor: 'rgba(168, 71, 46, 0.1)' }}
        >
          <motion.div
            className="h-full"
            style={{ backgroundColor: '#A8472E' }}
            animate={{ width: `${progress.percentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <span style={{ fontSize: 9 }}>{progress.percentage}%</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span style={{ color: luckColors[luckState] || '#7A7468' }}>
          气运 · {luckLabels[luckState] || '中和'}
        </span>
      </div>
    </div>
  );
}
