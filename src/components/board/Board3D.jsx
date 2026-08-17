import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import LiveBaguaArena from './LiveBaguaArena';
import LightOrb from './LightOrb';
import AgentGhosts from './AgentGhosts';
import PhaseTransitFX from './PhaseTransitFX';
import YaolinesFormation from './YaolinesFormation';
import DestinyRevealFX from './DestinyRevealFX';
import { COLORS } from './layoutConfig';
import { createGlowTexture } from '../../utils/trigramTextures';

function StarField() {
  const groupRef = useRef();
  const starTexture = useMemo(() => createGlowTexture(COLORS.gold.light, 64), []);
  const stars = useMemo(() => Array.from({ length: 120 }, () => ({
    x: (Math.random() - 0.5) * 30,
    y: (Math.random() - 0.5) * 15 + 3,
    z: (Math.random() - 0.5) * 30 - 5,
    size: 0.02 + Math.random() * 0.04,
    phase: Math.random() * Math.PI * 2,
  })), []);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    groupRef.current?.children.forEach((child, index) => {
      if (child.material) child.material.opacity = 0.3 + Math.sin(time * 0.5 + stars[index].phase) * 0.2;
    });
  });

  return (
    <group ref={groupRef}>
      {stars.map((star, index) => (
        <mesh key={index} position={[star.x, star.y, star.z]}>
          <sphereGeometry args={[star.size, 8, 8]} />
          <meshBasicMaterial map={starTexture} color={COLORS.gold.light} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
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
  selectedChoice,
  choices = [],
  inference,
  deliberationOracle,
  deliberationSessionId,
  fateRevealed = false,
  destinyArtwork = null,
  arenaView,
  onArenaNodeSelect,
  presentationMode = false,
}) {
  return (
    <group>
      {/* 全局氛围灯 */}
      <ambientLight intensity={0.12} color={'#3A3530'} />
      <directionalLight position={[2, 5, 3]} intensity={0.2} color={'#C8A850'} />
      <pointLight position={[0, 2, 1]} intensity={1.0} color={'#F0D890'} distance={10} decay={2} />

      <StarField />
      <PhaseTransitFX phase={phase} />

      <LightOrb
        phase={phase}
        position={[0, 1.5, 0]}
        fateRevealed={fateRevealed}
      />

      <DestinyRevealFX
        phase={phase}
        oracle={deliberationOracle || inference?.oracle || null}
        dynamicChoices={choices}
        selectedChoice={selectedChoice}
        revealed={fateRevealed}
        inference={inference}
        artwork={destinyArtwork}
      />

      {/* 【全新动画 2/3】立卦：6 爻线从外围旋转汇入，到达朱砂闪烁后 halo 爆发 */}
      <YaolinesFormation
        phase={phase}
        oracle={deliberationOracle || inference?.oracle || null}
        question={userInput || ''}
        sessionId={deliberationSessionId || inference?.sessionId || ''}
      />

      <LiveBaguaArena
        view={arenaView}
        onSelectNode={onArenaNodeSelect}
        presentationMode={presentationMode}
        hideAdvisorNodes={false}
        finalMode={phase === 'final'}
      />

      {!presentationMode && <AgentGhosts
        phase={phase}
        activeAgentIdx={activeAgentIdx}
        activeAgents={activeAgents}
        agentDialogues={agentDialogues}
        onAgentClick={onAgentClick}
      />}

    </group>
  );
}
