import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';
import { createRuneTexture } from '../../utils/trigramTextures';

/**
 * 中心平台 - 用户站立的初始方块
 * 宣纸质感，边缘有细细的卦象装饰
 */
export default function CenterPlatform({ position = [0, 0, 0] }) {
  const groupRef = useRef();
  const topRef = useRef();
  const glowRef = useRef();

  // 顶部太极图纹理
  const taijiTexture = useMemo(() => createRuneTexture('☯', { size: 256, color: COLORS.ink.mid, accentColor: COLORS.gold.main, showName: false }), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (glowRef.current) {
      const breath = 1 + Math.sin(t * 0.4) * 0.04;
      glowRef.current.scale.set(breath, 1, breath);
      glowRef.current.material.opacity = 0.12 + Math.sin(t * 0.4) * 0.03;
    }
    if (topRef.current) {
      topRef.current.material.emissiveIntensity = 0.05 + Math.sin(t * 0.5) * 0.02;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 平台主体 - 方块 */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.4, 2.4]} />
        <meshStandardMaterial
          color={COLORS.platform.top}
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>

      {/* 顶面 - 带太极图 */}
      <mesh ref={topRef} position={[0, 0.205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshStandardMaterial
          color={COLORS.platform.top}
          map={taijiTexture}
          emissive={COLORS.gold.light}
          emissiveIntensity={0.05}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 边缘描边 */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(2.41, 0.41, 2.41)]} />
        <lineBasicMaterial color={COLORS.ink.light} transparent opacity={0.4} />
      </lineSegments>

      {/* 底部光晕 */}
      <mesh ref={glowRef} position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.8, 32]} />
        <meshBasicMaterial
          color={COLORS.gold.main}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 八卦装饰点 - 8个方向 */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const r = 1.05;
        return (
          <mesh key={i} position={[Math.cos(angle) * r, 0.21, Math.sin(angle) * r]}>
            <cylinderGeometry args={[0.04, 0.04, 0.02, 8]} />
            <meshStandardMaterial
              color={COLORS.gold.main}
              emissive={COLORS.gold.light}
              emissiveIntensity={0.3}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}
