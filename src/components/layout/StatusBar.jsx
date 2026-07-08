import { useGame } from '../../context/GameContext';

export default function StatusBar() {
  const { state, getProgress } = useGame();
  const { phase, diceResult, luckState } = state;
  const progress = getProgress();

  if (phase === 'idle') return null;

  const phaseLabels = {
    input: '等待输入',
    branch_select: '选择分支',
    agent_debate: 'Agent 辩论中',
    dice: '掷骰子',
    fate_reveal: '命运揭示',
    done: '推演完成',
  };

  const luckColors = { optimistic: 'text-retro-green', pessimistic: 'text-risk-red', neutral: 'text-[#888]' };
  const luckLabels = { optimistic: '乐观', pessimistic: '悲观', neutral: '中立' };

  return (
    <div className="h-8 bg-terminal/90 border-b border-[#444] flex items-center px-4 text-[10px] font-mono text-[#ccc] gap-4">
      <span className="text-retro-green font-bold">演策</span>
      <span className="text-[#666]">|</span>
      <span>FILE 01/04</span>
      <span className="text-[#666]">|</span>
      <span className={phase === 'done' ? 'text-[#888]' : 'text-retro-green'}>
        {phase === 'done' ? 'DONE' : 'RUNNING'}
      </span>
      <span className="text-[#666]">|</span>
      <span>STEP {progress.depth}/4</span>
      <div className="flex-1 flex items-center gap-2 ml-4">
        <div className="flex-1 h-1 bg-[#444] max-w-[200px]">
          <div className="h-full bg-retro-green transition-all duration-500" style={{ width: `${progress.percentage}%` }} />
        </div>
        <span>{progress.percentage}%</span>
      </div>
      <span className="text-[#666]">|</span>
      <span>已揭示 {state.visitedNodes.size}/10</span>
      <span className="text-[#666]">|</span>
      <span className={luckColors[luckState]}>运气: {luckLabels[luckState]}</span>
    </div>
  );
}
