export function createScrollVelocityAnimation({ baseVelocity = 1.4, direction = 1, reducedMotion = false } = {}) {
  if (reducedMotion) return null;
  const speed = Math.max(0.5, Math.abs(Number(baseVelocity) || 1.4));
  return {
    animate: { x: direction < 0 ? ['-50%', '0%'] : ['0%', '-50%'] },
    transition: { duration: 52 / speed, repeat: Infinity, ease: 'linear' },
  };
}

export default createScrollVelocityAnimation;
