import { motion, useReducedMotion } from 'framer-motion';

/**
 * SplitText - 按词/字拆分入场动画 (React Bits 风格手写实现)
 * 文字逐词从下方上浮 + 模糊到清晰。
 */
export default function SplitText({
  text,
  className = '',
  delay = 0,
  stagger = 0.06,
  duration = 0.7,
  by = 'word', // 'word' | 'char'
  as = 'h1',
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] || motion.h1;
  const units = by === 'char' ? [...text] : text.split(/(\s+)/);

  if (reduce) {
    return <MotionTag className={className}>{text}</MotionTag>;
  }

  return (
    <MotionTag className={className} aria-label={text}>
      {units.map((u, i) => {
        if (/^\s+$/.test(u)) return u;
        return (
          <motion.span
            key={i}
            style={{ display: 'inline-block', willChange: 'transform, opacity, filter' }}
            initial={{ y: '0.4em', opacity: 0, filter: 'blur(8px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            transition={{
              delay: delay + i * stagger,
              duration,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {u}
          </motion.span>
        );
      })}
    </MotionTag>
  );
}
