import { useReducedMotion } from 'framer-motion';

/**
 * ShinyText - 流光文字 (纯 CSS 实现, React Bits 风格)
 * 文字表面有高光从左到右扫过。
 */
export default function ShinyText({ children, className = '', color = '#888', shineColor = '#00A86B', duration = 3 }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className} style={{ color }}>{children}</span>;

  return (
    <span
      className={className}
      style={{
        background: `linear-gradient(110deg, ${color} 30%, ${shineColor} 50%, ${color} 70%)`,
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `shiny-sweep ${duration}s linear infinite`,
      }}
    >
      <style>{`@keyframes shiny-sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      {children}
    </span>
  );
}
