import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';

/**
 * 中国风水墨装饰层
 * - 水墨粒子（淡墨飘动）
 * - 远处水墨山峦剪影
 * - 八卦纹理（缓慢旋转）
 * - 暖金色粒子点缀
 */
export default function DecorationsLayer() {
  const inkPointsRef = useRef();
  const goldPointsRef = useRef();
  const baguaRef = useRef();
  const mountainsRef = useRef();

  // 水墨粒子 - 300 个，淡墨色，缓慢飘动
  const inkParticles = useMemo(() => {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 12 - 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
      speeds[i] = 0.08 + Math.random() * 0.12;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases, count };
  }, []);

  // 暖金色粒子 - 80 个，少量点缀
  const goldParticles = useMemo(() => {
    const count = 80;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 14;
      positions[i * 3]     = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * 8 + 0.5;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return { positions, count };
  }, []);

  // 远处水墨山峦剪影 - 3 座，淡而远
  const mountains = useMemo(() => {
    const items = [];
    const count = 3;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 1.2 - Math.PI / 2 - Math.PI * 0.6;
      const radius = 20 + i * 2;
      items.push({
        id: i,
        position: [Math.cos(angle) * radius, -2.5, Math.sin(angle) * radius],
        scale: [8 + i * 2, 3 + i, 1],
        rotationY: -angle + Math.PI / 2,
        opacity: 0.06 + i * 0.02,
        color: COLORS.ink.light,
      });
    }
    return items;
  }, []);

  // 保存粒子原始位置用于动画
  const inkBaseRef = useMemo(() => inkParticles.positions.slice(), [inkParticles]);
  const goldBaseRef = useMemo(() => goldParticles.positions.slice(), [goldParticles]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // 水墨粒子缓慢飘动 - 像水墨散开
    if (inkPointsRef.current) {
      const pos = inkPointsRef.current.geometry.attributes.position;
      const base = inkBaseRef;
      for (let i = 0; i < inkParticles.count; i++) {
        const s = inkParticles.speeds[i];
        const p = inkParticles.phases[i];
        pos.array[i * 3]     = base[i * 3]     + Math.sin(t * s + p) * 0.6;
        pos.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * s * 0.7 + p) * 0.4;
        pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * s * 0.5 + p) * 0.5;
      }
      pos.needsUpdate = true;
      // 透明度呼吸
      const breath = 0.5 + Math.sin(t * 0.4) * 0.08;
      inkPointsRef.current.material.opacity = breath;
    }

    // 金色粒子轻微浮动
    if (goldPointsRef.current) {
      const pos = goldPointsRef.current.geometry.attributes.position;
      const base = goldBaseRef;
      for (let i = 0; i < goldParticles.count; i++) {
        pos.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.3 + i * 0.5) * 0.3;
      }
      pos.needsUpdate = true;
      goldPointsRef.current.rotation.y = t * 0.015;
      goldPointsRef.current.material.opacity = 0.6 + Math.sin(t * 0.5) * 0.1;
    }

    // 八卦缓慢旋转
    if (baguaRef.current) {
      baguaRef.current.rotation.z = t * 0.05;
    }

    // 山峦轻微起伏
    if (mountainsRef.current) {
      mountainsRef.current.children.forEach((child, i) => {
        if (!child) return;
        child.position.y = -1.2 + Math.sin(t * 0.2 + i) * 0.05;
      });
    }
  });

  return (
    <group>
      {/* 水墨粒子 - 淡墨色 */}
      <points ref={inkPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={inkParticles.count}
            array={inkParticles.positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={COLORS.ink.mid}
          size={0.12}
          transparent
          opacity={0.5}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.NormalBlending}
        />
      </points>

      {/* 暖金色粒子点缀 */}
      <points ref={goldPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={goldParticles.count}
            array={goldParticles.positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={COLORS.gold.light}
          size={0.08}
          transparent
          opacity={0.6}
          depthWrite={false}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* 远处水墨山峦剪影 */}
      <group ref={mountainsRef}>
        {mountains.map(m => (
          <mesh
            key={m.id}
            position={m.position}
            rotation={[0, m.rotationY, 0]}
            scale={m.scale}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              color={m.color}
              transparent
              opacity={m.opacity}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      {/* 八卦纹理 - 浅灰色，缓慢旋转 */}
      <mesh ref={baguaRef} position={[0, 6, -12]} rotation={[-Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[2.5, 3.2, 64]} />
        <meshBasicMaterial
          color={COLORS.ink.light}
          transparent
          opacity={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 6, -12]} rotation={[-Math.PI / 2.2, 0, 0]}>
        <ringGeometry args={[1.6, 1.8, 64]} />
        <meshBasicMaterial
          color={COLORS.ink.light}
          transparent
          opacity={0.1}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
