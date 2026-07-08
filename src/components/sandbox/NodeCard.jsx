import { motion } from 'framer-motion';
import { NODES } from '../../data/nodes';
import { useGame } from '../../context/GameContext';
import { useSound } from '../../hooks/useSound';

const typeColors = {
  input: '#00A86B',
  fog: '#888',
  crossroad: '#D4A017',
  deep: '#9B59B6',
  fate: '#D4A017',
};

export default function NodeCard({ nodeId, node, visited, revealed, active, zoom }) {
  const { state, selectBranch } = useGame();
  const { sfxClick } = useSound();
  const isClickable = revealed && !visited && node.type === 'fog' && state.currentNodeId &&
    (NODES[state.currentNodeId]?.branches?.some(b => b.targetId === nodeId) || false);

  const handleClick = () => {
    if (!isClickable) return;
    sfxClick();
    const currentNode = NODES[state.currentNodeId];
    const branch = currentNode.branches.find(b => b.targetId === nodeId);
    if (branch) {
      selectBranch(state.currentNodeId, nodeId, branch);
    }
  };

  const nodeType = node.type;
  const color = visited ? typeColors[nodeType] || '#888' : '#888';

  return (
    <motion.div
      className="absolute node-card"
      style={{
        left: `${node.position.x * 100}%`,
        top: `${node.position.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: visited ? 10 : active ? 8 : 5,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: revealed ? 1 : 0.8,
        opacity: revealed ? 1 : 0.4,
      }}
      whileHover={isClickable ? { scale: 1.08, y: -4 } : { scale: 1.02 }}
      onClick={handleClick}
    >
      <div
        className={`
          relative px-3 py-2 border-pixel font-mono text-center min-w-[80px]
          transition-all duration-200
          ${active ? 'ring-2 ring-retro-green ring-offset-1 ring-offset-paper' : ''}
          ${isClickable ? 'cursor-pointer' : ''}
        `}
        style={{
          backgroundColor: visited ? '#FDFAF5' : '#E8E2D5',
          borderColor: active ? '#00A86B' : color,
          boxShadow: visited
            ? `0 2px 8px rgba(0,0,0,0.1), 0 0 0 1px ${color}33`
            : '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {/* Card "thickness" effect */}
        <div className="absolute -bottom-1 left-0 right-0 h-1" style={{ backgroundColor: color + '44' }} />

        {/* Title */}
        <div className={`text-xs font-bold whitespace-nowrap ${visited ? '' : 'text-[#aaa]'}`}>
          {visited || active ? node.label : '???'}
        </div>

        {/* Probability badge */}
        {visited && node.probability && (
          <div className="text-[8px] text-[#888] mt-0.5">{node.probability}%</div>
        )}

        {/* Fog overlay for unrevealed */}
        {!visited && revealed && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[#E8E2D5]/60 animate-fog-breathe"
              style={{
                backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.05) 1px, transparent 1px)',
                backgroundSize: '4px 4px',
              }} />
            <div className="absolute inset-0 bg-[#E8E2D5]/30"
              style={{
                backgroundImage: 'radial-gradient(circle at 70% 70%, rgba(0,0,0,0.03) 1px, transparent 1px)',
                backgroundSize: '3px 3px',
                animation: 'fogBreathe 5s ease-in-out infinite reverse',
              }} />
          </div>
        )}

        {/* Unrevealed: fully hidden */}
        {!revealed && (
          <div className="absolute inset-0 bg-[#ccc]/40" />
        )}
      </div>

      {/* Hover tooltip */}
      {isClickable && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-terminal text-[8px] text-retro-green font-mono px-2 py-0.5 whitespace-nowrap pointer-events-none z-50"
          style={{ opacity: 0 }}
        >
          {node.hasDice ? '点击翻牌 · 含骰子' : '点击翻牌'}
        </div>
      )}
    </motion.div>
  );
}
