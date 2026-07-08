import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── face rotation map: value -> { rotateX, rotateY } ── */
const FACE_TRANSFORMS = {
  1: { rotateX: 0,   rotateY: 0 },
  2: { rotateX: 0,   rotateY: -90 },
  3: { rotateX: -90, rotateY: 0 },
  4: { rotateX: 90,  rotateY: 0 },
  5: { rotateX: 0,   rotateY: 90 },
  6: { rotateX: 0,   rotateY: 180 },
};

/* ── dot layout for each face value ── */
const DOT_POSITIONS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

const HALF = 40; // half of 80px cube

/* ── individual face component ── */
function DiceFace({ value, transform }) {
  const dots = DOT_POSITIONS[value];
  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: '#FDFAF5',
        border: '1px solid #e0dbd2',
        borderRadius: '3px',
        transform,
      }}
    >
      {dots.map(([x, y], i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#1E1E2E',
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}

/* ── styles object ── */
const styles = {
  wrapper: (size) => ({
    perspective: `${size * 4}px`,
    width: size,
    height: size,
  }),
  cube: (size, rx, ry, state) => ({
    width: size,
    height: size,
    position: 'relative',
    transformStyle: 'preserve-3d',
    transition: state === 'rolling'
      ? 'transform 0.08s linear'
      : 'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)',
    transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
    animation: state === 'idle' ? 'dice-float 3s ease-in-out infinite' : 'none',
  }),
  glow: {
    boxShadow: '0 0 20px 4px rgba(0, 168, 107, 0.5)',
    animation: 'dice-glow 1.5s ease-in-out infinite',
  },
};

/* ── keyframes injected once ── */
const keyframes = `
@keyframes dice-float {
  0%, 100% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); }
  50% { transform: translateY(-6px) rotateX(3deg) rotateY(5deg); }
}
@keyframes dice-glow {
  0%, 100% { box-shadow: 0 0 12px 2px rgba(0, 168, 107, 0.35); }
  50% { box-shadow: 0 0 28px 6px rgba(0, 168, 107, 0.65); }
}
`;

export default function Dice3D({ onRoll, rolling, result, size = 80 }) {
  const cubeRef = useRef(null);
  const [rx, setRx] = useState(0);
  const [ry, setRy] = useState(0);
  const [state, setState] = useState('idle');
  const rollTimerRef = useRef(null);
  const half = size / 2;

  /* inject keyframes once */
  useEffect(() => {
    const id = 'dice3d-keyframes';
    if (!document.getElementById(id)) {
      const tag = document.createElement('style');
      tag.id = id;
      tag.textContent = keyframes;
      document.head.appendChild(tag);
    }
  }, []);

  /* random rolling animation */
  const cycleRandomFace = useCallback(() => {
    const vals = [1, 2, 3, 4, 5, 6];
    const pick = vals[Math.floor(Math.random() * vals.length)];
    const extraX = (Math.floor(Math.random() * 4) + 2) * 360;
    const extraY = (Math.floor(Math.random() * 4) + 2) * 360;
    const t = FACE_TRANSFORMS[pick];
    setRx(t.rotateX + extraX);
    setRy(t.rotateY + extraY);
  }, []);

  useEffect(() => {
    if (rolling) {
      setState('rolling');
      /* cycle faces rapidly */
      const id = setInterval(cycleRandomFace, 80);
      rollTimerRef.current = id;

      /* stop after 1.5s and settle */
      const settleId = setTimeout(() => {
        clearInterval(rollTimerRef.current);
        if (result != null) {
          const t = FACE_TRANSFORMS[result];
          setRx(t.rotateX);
          setRy(t.rotateY);
          setState('result');
          onRoll?.(result);
        } else {
          setState('idle');
        }
      }, 1500);

      return () => {
        clearInterval(rollTimerRef.current);
        clearTimeout(settleId);
      };
    } else if (result == null) {
      setState('idle');
      setRx(0);
      setRy(0);
    }
  }, [rolling, result, cycleRandomFace, onRoll]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        style={styles.wrapper(size)}
      >
        <div
          ref={cubeRef}
          style={{
            ...styles.cube(size, rx, ry, state),
            ...(state === 'result' ? styles.glow : {}),
          }}
        >
          {/* front - 1 */}
          <DiceFace value={1} transform={`translateZ(${half}px)`} />
          {/* back - 6 */}
          <DiceFace value={6} transform={`rotateY(180deg) translateZ(${half}px)`} />
          {/* right - 2 */}
          <DiceFace value={2} transform={`rotateY(90deg) translateZ(${half}px)`} />
          {/* left - 5 */}
          <DiceFace value={5} transform={`rotateY(-90deg) translateZ(${half}px)`} />
          {/* top - 3 */}
          <DiceFace value={3} transform={`rotateX(90deg) translateZ(${half}px)`} />
          {/* bottom - 4 */}
          <DiceFace value={4} transform={`rotateX(-90deg) translateZ(${half}px)`} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
