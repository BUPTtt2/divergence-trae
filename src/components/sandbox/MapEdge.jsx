import { motion } from 'framer-motion';

export default function MapEdge({ fromX, fromY, toX, toY, explored }) {
  return (
    <g>
      {/* Main line */}
      <motion.line
        x1={`${fromX * 100}%`}
        y1={`${fromY * 100}%`}
        x2={`${toX * 100}%`}
        y2={`${toY * 100}%`}
        stroke={explored ? '#00A86B' : '#bbb'}
        strokeWidth={explored ? 2.5 : 1.5}
        strokeDasharray={explored ? 'none' : '6 4'}
        opacity={explored ? 0.7 : 0.4}
        initial={false}
        style={explored ? { filter: 'drop-shadow(0 0 3px rgba(0,168,107,0.3))' } : {}}
      />
      {/* Flowing dot on explored */}
      {explored && (
        <motion.circle
          r="3"
          fill="#00A86B"
          opacity="0.9"
          animate={{
            cx: [`${fromX * 100}%`, `${toX * 100}%`, `${fromX * 100}%`],
            cy: [`${fromY * 100}%`, `${toY * 100}%`, `${fromY * 100}%`],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{ filter: 'drop-shadow(0 0 4px rgba(0,168,107,0.6))' }}
        />
      )}
      {/* Subtle pulse on unexplored */}
      {!explored && (
        <motion.line
          x1={`${fromX * 100}%`}
          y1={`${fromY * 100}%`}
          x2={`${toX * 100}%`}
          y2={`${toY * 100}%`}
          stroke="#ccc"
          strokeWidth={1}
          strokeDasharray="6 4"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </g>
  );
}
