import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';

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
  baseVelocity = 3,
  direction = 1,
  className = '',
  separator = '·',
}) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  // scrollYProgress 0->1 映射到速度倍率
  const velocity = useTransform(scrollYProgress, [0, 0.5, 1], [baseVelocity, baseVelocity * 2, baseVelocity]);
  const x = useTransform(velocity, (v) => `-${v * 40}px`);

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {items.join(` ${separator} `)}
      </div>
    );
  }

  const row = [...items, ...items, ...items, ...items];

  return (
    <div ref={ref} className={className} style={{ overflow: 'hidden' }}>
      <motion.div style={{ x, display: 'flex', gap: '2.5rem', whiteSpace: 'nowrap', willChange: 'transform' }}>
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
