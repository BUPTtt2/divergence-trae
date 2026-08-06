import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import LightOrb from './LightOrb';
import AgentGhosts from './AgentGhosts';
import PhaseTransitFX from './PhaseTransitFX';
import YaolinesFormation from './YaolinesFormation';
import DestinyRevealFX from './DestinyRevealFX';
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
  yanOptions,
  deliberationOracle,
  deliberationSessionId,
  fateRevealed = false,
}) {
  return (
    <group>
      {/* 全局氛围灯 */}
      <ambientLight intensity={0.12} color={'#3A3530'} />
      <directionalLight position={[2, 5, 3]} intensity={0.2} color={'#C8A850'} />
      <pointLight position={[0, 2, 1]} intensity={1.0} color={'#F0D890'} distance={10} decay={2} />

      {/* 远处星点 */}
      <StarField />

      {/* 【全新动画 1/3】阶段切换：卦符粒子爆炸 + 全局光脉冲 */}
      <PhaseTransitFX phase={phase} />

      {/* 中心光球 - 演 */}
      <LightOrb
        phase={phase}
        position={[0, 1.5, 0]}
        selectedChoice={selectedChoice}
        activeAgents={activeAgents}
        inference={inference}
        yanOptions={yanOptions}
      />

      {/* 【全新动画 2/3】立卦：6 爻线从外围旋转汇入，到达朱砂闪烁后 halo 爆发 */}
      <YaolinesFormation
        phase={phase}
        oracle={deliberationOracle || inference?.oracle || null}
        question={userInput || ''}
        sessionId={deliberationSessionId || inference?.sessionId || ''}
      />

      {/* Agent 虚影 - 围绕光球上方分布 */}
      <AgentGhosts
        phase={phase}
        activeAgentIdx={activeAgentIdx}
        activeAgents={activeAgents}
        agentDialogues={agentDialogues}
        onAgentClick={onAgentClick}
      />

      {/* 【全新动画 3/3】命牌：3D 升起 → Y 轴翻牌 → 朱砂印 + 金字 + 金色 halo 环绕
          只有 fateRevealed=true（点击"揭示命签"）后才显示浮起命牌 */}
      <DestinyRevealFX
        phase={phase}
        oracle={deliberationOracle || inference?.oracle || null}
        dynamicChoices={inference?.dynamicChoices || []}
        selectedChoice={selectedChoice || null}
        revealed={fateRevealed}
      />
    </group>
  );
}
