import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';

/* 底栏 - 水墨风 */
export default function BottomBar() {
  const navigate = useNavigate();
  const { state, resetGame } = useGame();

  const btnStyle = {
    padding: '4px 12px',
    fontSize: 11,
    color: '#7A7468',
    background: 'transparent',
    border: '1px solid rgba(168, 71, 46, 0.25)',
    borderRadius: 2,
    cursor: 'pointer',
    fontFamily: '"Ma Shan Zheng", serif',
    letterSpacing: '0.15em',
    transition: 'all 0.2s',
  };

  return (
    <div
      className="h-12 flex items-center px-4 shrink-0 gap-3"
      style={{
        backgroundColor: '#FAF6EC',
        borderTop: '1px solid rgba(168, 71, 46, 0.2)',
      }}
    >
      <button
        style={btnStyle}
        onClick={() => { resetGame(); navigate('/scenarios'); }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#A8472E'; e.currentTarget.style.borderColor = '#A8472E'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#7A7468'; e.currentTarget.style.borderColor = 'rgba(168, 71, 46, 0.25)'; }}
      >
        ← 返回剧本
      </button>
      <button
        style={btnStyle}
        onClick={resetGame}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#A8472E'; e.currentTarget.style.borderColor = '#A8472E'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#7A7468'; e.currentTarget.style.borderColor = 'rgba(168, 71, 46, 0.25)'; }}
      >
        重新推演
      </button>
      <div className="flex-1" />
      <span style={{ fontSize: 10, color: '#7A7468', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
        {state.phase === 'idle' ? '选择一个剧本开始推演' : phaseHint(state.phase)}
      </span>
      <div className="flex-1" />
    </div>
  );
}

function phaseHint(phase) {
  const hints = {
    input: '写下你的纠结',
    analyzing: '演正在立卦...',
    summoning: '智囊正在汇聚...',
    agent_debate: '智囊各抒己见',
    summary: '演正在梳理',
    branch_select: '请选择你的路径',
    path_reveal: '路径已现',
    fate_reveal: '命运已揭示',
    done: '推演已成',
  };
  return hints[phase] || '';
}
