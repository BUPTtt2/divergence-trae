import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { createScrollVelocityAnimation } from './scrollVelocityModel.js';

/**
 * ScrollVelocity - 滚动速度驱动的横向文字带 (React Bits 风格)
 * 多个关键词横向滚动，滚动越快移动越快。
 *
 * props:
 *  - items: string[]  关键词数组
 *  - baseVelocity: 基础速度 (px/帧)
 *  - direction: 1 | -1
 */
export default function ScrollVelocity({
  items,
  baseVelocity = 1.4,
  direction = 1,
  className = '',
  separator = '·',
}) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const animation = createScrollVelocityAnimation({ baseVelocity, direction, reducedMotion: reduce });

  if (reduce) {
    return (
      <div ref={ref} className={className} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '.55rem 1rem' }}>
        {items.map((item) => <span key={item}>{item}</span>)}
      </div>
    );
  }

  const row = [...items, ...items];

  return (
    <div ref={ref} className={className} style={{ overflow: 'hidden' }}>
      <motion.div {...animation} style={{ width: 'max-content', display: 'flex', gap: '2.5rem', whiteSpace: 'nowrap', willChange: 'transform' }}>
        {row.map((item, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '2.5rem' }}>
            <span>{item}</span>
            <span style={{ opacity: 0.4 }}>{separator}</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
