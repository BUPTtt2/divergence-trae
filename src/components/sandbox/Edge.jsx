import { motion } from 'framer-motion';

export default function Edge({ fromX, fromY, toX, toY, explored, fromDepth, toDepth }) {
  const opacityScale = (depth) => 1 - depth * 0.1;
  const widthScale = (depth) => 1 - depth * 0.15;
  const baseOpacity = explored ? 0.8 : 0.2;
  const opacity = Math.max(0.1, baseOpacity * opacityScale(toDepth));
  const width = Math.max(1, (explored ? 2 : 1) * widthScale(toDepth));

  return (
    <g>
      <motion.line
        x1={`${fromX}%`}
        y1={`${fromY}%`}
        x2={`${toX}%`}
        y2={`${toY}%`}
        stroke={explored ? '#00A86B' : '#999'}
        strokeWidth={width}
        strokeDasharray={explored ? 'none' : '6 4'}
        opacity={opacity}
        initial={false}
        animate={{ opacity }}
        style={{ filter: explored ? 'drop-shadow(0 0 2px rgba(0,168,107,0.3))' : 'none' }}
      />
      {/* Flowing dot on explored edges */}
      {explored && (
        <>
          <motion.circle
            r="3"
            fill="#00A86B"
            opacity="0.8"
            animate={{
              cx: [`${fromX}%`, `${toX}%`],
              cy: [`${fromY}%`, `${toY}%`],
              opacity: [0.8, 0.3, 0.8],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        </>
      )}
    </g>
  );
}
