import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, getAgentPosition } from './layoutConfig';
import { createTrigramPlateTexture, createGlowTexture } from '../../utils/trigramTextures';

/**
 * 单个 Agent 3D 模型
 * - 八角棱柱基座（立体感）
 * - 顶部卦象牌（立体 ico）
 * - 顶光
 * - 浮动 / 旋转
 * - 活动时高亮 + 光柱
 */
function AgentPillar({ agent, index, total, active, retreating, onClick }) {
  const groupRef = useRef();
  const pillarRef = useRef();
  const topRef = useRef();
  const topLightRef = useRef();
  const auraRef = useRef();

  const agentColor = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
  const trigram = agent.icon || '☰';

  // 八卦盘纹理（Agent 顶部） - 用对应卦象
  const trigramTex = useMemo(() => createTrigramPlateTexture(trigram, {
    color: agentColor.glow,
    size: 256,
    showName: false,
  }), [trigram, agentColor.glow]);

  const auraTex = useMemo(() => createGlowTexture(agentColor.glow, 256), [agentColor.glow]);
  const topLightTex = useMemo(() => createGlowTexture(agentColor.glow, 128), [agentColor.glow]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    // 浮动
    const pos = getAgentPosition(index, total);
    const floatY = pos.y + Math.sin(t * 0.5 + index) * 0.08;
    groupRef.current.position.y = floatY;
    groupRef.current.position.x = pos.x;
    groupRef.current.position.z = pos.z;

    // 旋转
    if (pillarRef.current) {
      pillarRef.current.rotation.y = t * 0.2 + index * 0.5;
    }
    if (topRef.current) {
      // 活动时自旋更快
      const rotSpeed = active ? 0.8 : 0.3;
      topRef.current.rotation.y = t * rotSpeed;
    }

    // 顶光呼吸
    if (topLightRef.current && topLightRef.current.material) {
      const pulse = (active ? 0.9 : 0.5) + Math.sin(t * 1.5 + index) * 0.2;
      topLightRef.current.material.opacity = pulse;
      const scale = (active ? 1.2 : 0.8) + Math.sin(t * 1.5 + index) * 0.15;
      topLightRef.current.scale.set(scale, scale, 1);
    }

    // 整体光晕
    if (auraRef.current && auraRef.current.material) {
      const auraOpacity = (active ? 0.6 : 0.2) + Math.sin(t * 0.8 + index) * 0.05;
      auraRef.current.material.opacity = retreating ? 0.05 : auraOpacity;
    }
  });

  const scale = retreating ? 0.55 : 1;
  const pillarHeight = 0.9;

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      {/* 底部光晕 */}
      <mesh ref={auraRef} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial map={auraTex} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 八角棱柱基座 */}
      <mesh
        ref={pillarRef}
        position={[0, pillarHeight / 2 - 0.3, 0]}
        onClick={(e) => { e.stopPropagation(); onClick?.(agent); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <cylinderGeometry args={[0.22, 0.28, pillarHeight, 8, 1]} />
        <meshStandardMaterial
          color={agentColor.main}
          emissive={agentColor.glow}
          emissiveIntensity={active ? 0.6 : 0.2}
          metalness={0.6}
          roughness={0.3}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* 顶部卦象牌（八面体） */}
      <mesh ref={topRef} position={[0, pillarHeight - 0.05, 0]}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial
          map={trigramTex}
          color={agentColor.glow}
          emissive={agentColor.glow}
          emissiveIntensity={active ? 1.2 : 0.5}
          metalness={0.4}
          roughness={0.2}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 顶部光晕 */}
      <mesh ref={topLightRef} position={[0, pillarHeight + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshBasicMaterial
          map={topLightTex}
          color={agentColor.glow}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 顶部点光（活动时） */}
      {active && <pointLight color={agentColor.glow} intensity={0.6} distance={1.5} decay={2} position={[0, pillarHeight, 0]} />}

      {/* 名称 + 立场 标签 */}
      <Html
        position={[0, pillarHeight + 0.4, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          textAlign: 'center',
          color: agentColor.glow,
          textShadow: `0 0 8px ${agentColor.glow}, 0 0 4px #000`,
          fontFamily: '"Ma Shan Zheng", serif',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '0.3em',
            paddingLeft: '0.3em',
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize: '9px',
            letterSpacing: '0.2em',
            marginTop: '2px',
            opacity: 0.7,
            paddingLeft: '0.2em',
          }}>
            {agent.stance}
          </div>
        </div>
      </Html>
    </group>
  );
}

/**
 * 3D Agent 容器
 */
export default function AgentHud3D({ phase, activeAgentIdx, activeAgents, onAgentClick }) {
  if (phase === 'input' || phase === 'analyzing') return null;

  const agents = (activeAgents || []).filter((a) => a.role !== 'master');
  if (agents.length === 0) return null;

  const retreating = phase === 'summary' || phase === 'branch_select';

  return (
    <group>
      {agents.map((agent, index) => (
        <AgentPillar
          key={agent.id}
          agent={agent}
          index={index}
          total={agents.length}
          active={activeAgentIdx === index}
          retreating={retreating}
          onClick={onAgentClick}
        />
      ))}
    </group>
  );
}
