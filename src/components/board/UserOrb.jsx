import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';
import { createGlowTexture } from '../../utils/trigramTextures';

export default function UserOrb({ phase, userInput, position = [-0.6, 0.6, 0.5] }) {
  const groupRef = useRef();
  const coreRef = useRef();
  const glowRef = useRef();

  const glowTexture = useMemo(() => createGlowTexture('#F0D890', 256), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    const floatY = position[1] + Math.sin(t * 0.5) * 0.08;
    groupRef.current.position.y = floatY;

    if (coreRef.current) {
      const isActive = phase === 'input' || phase === 'user_responding' || phase === 'analyzing';
      const pulse = 1 + Math.sin(t * (isActive ? 1.5 : 0.8)) * 0.08;
      coreRef.current.scale.set(pulse, pulse, pulse);
    }

    if (glowRef.current) {
      const breath = 1.1 + Math.sin(t * 0.6) * 0.1;
      glowRef.current.scale.set(breath, breath, 1);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 外层光晕 */}
      <mesh ref={glowRef}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 核心球 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.18, 32, 32]} />
        <meshBasicMaterial color={'#FFF5D0'} />
      </mesh>

      {/* 文字气泡 */}
      {userInput && (phase === 'input' || phase === 'user_responding') && (
        <Html position={[0, 0.7, 0]} center distanceFactor={7}>
          <div style={{
            padding: '8px 16px',
            background: 'rgba(0,0,0,0.85)',
            color: '#F0D890',
            fontSize: '13px',
            fontFamily: '"Noto Serif SC", serif',
            whiteSpace: 'nowrap',
            maxWidth: '280px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            borderLeft: '2px solid #C8A850',
            letterSpacing: '0.05em',
            backdropFilter: 'blur(8px)',
          }}>
            {userInput}
          </div>
        </Html>
      )}
    </group>
  );
}
