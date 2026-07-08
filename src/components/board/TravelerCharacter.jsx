import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';

export default function TravelerCharacter({ position = [0, 0.3, 0] }) {
  const groupRef = useRef();
  const capeRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    const breathe = Math.sin(t * 1.5) * 0.015;
    groupRef.current.position.y = position[1] + breathe;

    if (capeRef.current) {
      capeRef.current.rotation.x = Math.sin(t * 2) * 0.08 - 0.2;
      capeRef.current.rotation.z = Math.sin(t * 1.3) * 0.03;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 身体 */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.18, 0.28, 0.12]} />
        <meshStandardMaterial color={COLORS.traveler.body} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* 披风 */}
      <group ref={capeRef} position={[0, 0.3, -0.08]}>
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[0.22, 0.3, 0.02]} />
          <meshStandardMaterial color={COLORS.traveler.cape} roughness={0.6} metalness={0.05} />
        </mesh>
      </group>

      {/* 头 */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color={COLORS.traveler.hat} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* 帽子 */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.22, 0.08, 0.18]} />
        <meshStandardMaterial color={COLORS.traveler.hat} roughness={0.4} metalness={0.1} />
      </mesh>

      {/* 腿 */}
      <mesh position={[-0.05, 0.02, 0]} castShadow>
        <boxGeometry args={[0.06, 0.12, 0.08]} />
        <meshStandardMaterial color={COLORS.traveler.hat} roughness={0.6} />
      </mesh>
      <mesh position={[0.05, 0.02, 0]} castShadow>
        <boxGeometry args={[0.06, 0.12, 0.08]} />
        <meshStandardMaterial color={COLORS.traveler.hat} roughness={0.6} />
      </mesh>

      {/* 脚边光晕 */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.12, 0.22, 16]} />
        <meshBasicMaterial
          color={COLORS.traveler.glow}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}