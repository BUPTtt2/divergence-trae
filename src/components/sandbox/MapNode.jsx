import { useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '../../context/GameContext';
import { useSound } from '../../hooks/useSound';
import { NODES } from '../../data/nodes';

const typeConfig = {
  input: { icon: '⚑', color: '#00A86B', bgColor: '#00A86B15', label: '起点' },
  fog: { icon: '?', color: '#888', bgColor: '#88815', label: '未知' },
  crossroad: { icon: '◆', color: '#E6B800', bgColor: '#E6B80015', label: '抉择' },
  deep: { icon: '◎', color: '#9B59B6', bgColor: '#9B59B615', label: '深思' },
  fate: { icon: '★', color: '#9B59B6', bgColor: '#9B59B620', label: '命运' },
};

export default function MapNode({ nodeId, node, x, y, visited, revealed, active, isAvailable }) {
  const { state, selectBranch } = useGame();
  const { sfxClick } = useSound();
  const config = typeConfig[node.type] || typeConfig.fog;
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (!isAvailable) return;
    sfxClick();
    const currentNode = state.currentNodeId ? NODES[state.currentNodeId] : null;
    if (!currentNode) return;
    const branch = currentNode.branches.find(b => b.targetId === nodeId);
    if (branch) {
      selectBranch(state.currentNodeId, nodeId, branch);
    }
  };

  // Determine visual state
  let stateClass = 'locked';
  if (visited) stateClass = 'visited';
  else if (isAvailable && revealed) stateClass = 'available';
  else if (revealed) stateClass = 'revealed';

  return (
    <motion.div
      className="absolute map-node"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: stateClass === 'available' ? 10 : stateClass === 'visited' ? 5 : 3,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: revealed ? 1 : 0.7,
        opacity: revealed ? 1 : 0.3,
      }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={handleClick}
    >
      <motion.div
        animate={stateClass === 'available' ?
          { y: [0, -4, 0], boxShadow: [`0 2px 8px rgba(0,168,107,0.2)`, `0 6px 16px rgba(0,168,107,0.4)`, `0 2px 8px rgba(0,168,107,0.2)`] } :
          stateClass === 'visited' ? { y: 0 } :
          hovered && revealed ? { y: -2, scale: 1.05 } : { y: 0, scale: 1 }
        }
        transition={stateClass === 'available' ? { duration: 2, repeat: Infinity } : { duration: 0.2 }}
        className={`
          relative w-[90px] px-2 py-2 border-2 font-mono text-center
          transition-colors duration-200
          ${stateClass === 'available' ? 'cursor-pointer' : ''}
        `}
        style={{
          borderColor: stateClass === 'available' ? '#00A86B' :
                       stateClass === 'visited' ? '#999' :
                       revealed ? '#ccc' : '#aaa',
          backgroundColor: stateClass === 'visited' ? '#F0EDE6' :
                            stateClass === 'available' ? '#FDFAF5' :
                            revealed ? '#EAE5DB' : '#DDD8CE',
          borderRadius: '4px',
        }}
      >
        {/* Thickness effect */}
        <div className="absolute -bottom-[2px] left-0 right-0 h-[2px]" style={{
          backgroundColor: stateClass === 'available' ? '#00A86B40' : 'rgba(0,0,0,0.06)',
        }} />

        {/* Icon */}
        <div className="text-lg mb-0.5">
          {stateClass === 'locked' || !revealed ? '⬡' :
           stateClass === 'visited' ? '✓' :
           config.icon}
        </div>

        {/* Label */}
        <div className={`
          text-[9px] font-bold leading-tight whitespace-nowrap
          ${stateClass === 'visited' ? 'text-[#999]' :
            stateClass === 'available' ? 'text-[#1E1E2E]' :
            'text-[#aaa]'}
        `}>
          {stateClass === 'locked' || !revealed ? '未解锁' :
           node.type === 'fate' ? node.label :
           stateClass === 'visited' ? (visited ? node.content?.title || node.label : '???') :
           node.content?.title || node.label}
        </div>

        {/* Type badge */}
        {(stateClass === 'available' || (revealed && !visited)) && (
          <div className="text-[7px] mt-0.5 px-1 inline-block border" style={{
            color: config.color, borderColor: config.color + '60',
            backgroundColor: config.bgColor,
          }}>
            {config.label}
          </div>
        )}

        {/* Fog overlay for revealed but not visited */}
        {revealed && !visited && stateClass !== 'available' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded">
            <div className="absolute inset-0 animate-pulse" style={{
              backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(0,0,0,0.06) 1px, transparent 1px)',
              backgroundSize: '3px 3px',
            }} />
          </div>
        )}

        {/* Glow for available */}
        {stateClass === 'available' && (
          <div className="absolute -inset-1 rounded pointer-events-none animate-pulse" style={{
            boxShadow: '0 0 12px rgba(0,168,107,0.3), inset 0 0 12px rgba(0,168,107,0.05)',
          }} />
        )}
      </motion.div>

      {/* Hover tooltip */}
      {hovered && isAvailable && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1E1E2E] text-[#00A86B] text-[8px] font-mono px-2 py-0.5 whitespace-nowrap z-50 border border-[#333]"
        >
          点击探索
        </motion.div>
      )}
    </motion.div>
  );
}
