import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import LightOrb from './LightOrb';
import AgentGhosts from './AgentGhosts';
import { COLORS } from './layoutConfig';
import { createGlowTexture } from '../../utils/trigramTextures';

/* ============================================================
   远处星点
============================================================ */
function StarField() {
  const groupRef = useRef();
  const starTex = useMemo(() => createGlowTexture(COLORS.gold.light, 64), []);

  const stars = useMemo(() => {
    return Array.from({ length: 120 }).map(() => ({
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 15 + 3,
      z: (Math.random() - 0.5) * 30 - 5,
      size: 0.02 + Math.random() * 0.04,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        if (child.material) {
          child.material.opacity = 0.3 + Math.sin(t * 0.5 + stars[i].phase) * 0.2;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {stars.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]}>
          <sphereGeometry args={[s.size, 8, 8]} />
          <meshBasicMaterial
            map={starTex}
            color={COLORS.gold.light}
            transparent
            opacity={0.4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
   Board3D 主组件
   - 移除用户小人 (UserFigure)
   - 移除阶梯路径 (StairPath)
   - 移除 3D 选择方块 (ChoiceBlocks) - 已迁到 2D HUD (ChoiceHud)
============================================================ */
export default function Board3D({
  phase,
  activeAgentIdx,
  activeAgents,
  agentDialogues,
  onAgentClick,
  userInput,
  showQuestion,
  selectedChoice,
  inference,
}) {
  return (
    <group>
      {/* 灯光 */}
      <ambientLight intensity={0.12} color={'#3A3530'} />
      <directionalLight position={[2, 5, 3]} intensity={0.2} color={'#C8A850'} />
      <pointLight position={[0, 2, 1]} intensity={1.0} color={'#F0D890'} distance={10} decay={2} />

      {/* 远处星点 */}
      <StarField />

      {/* 中心光球 - 演 (final 阶段会展示命运卡) */}
      <LightOrb
        phase={phase}
        position={[0, 1.5, 0]}
        selectedChoice={selectedChoice}
        activeAgents={activeAgents}
        inference={inference}
      />

      {/* Agent 虚影 - 围绕光球上方分布 */}
      <AgentGhosts
        phase={phase}
        activeAgentIdx={activeAgentIdx}
        activeAgents={activeAgents}
        agentDialogues={agentDialogues}
        onAgentClick={onAgentClick}
      />
    </group>
  );
}
