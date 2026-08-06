import { useRef } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';

export default function SpotlightCard({ children, className = '', style = {}, radius = 6, spotlightColor = 'rgba(0,168,107,0.18)' }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);

  const background = useTransform(
    [mx, my],
    ([x, y]) =>
      `radial-gradient(220px circle at ${x}px ${y}px, ${spotlightColor}, transparent 65%)`
  );

  const handleMove = (e) => {
    if (reduce || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set(e.clientX - rect.left);
    my.set(e.clientY - rect.top);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      className={className}
      style={{ position: 'relative', borderRadius: radius, overflow: 'hidden', ...style }}
    >
      {!reduce && (
        <motion.div
          style={{ background, position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
