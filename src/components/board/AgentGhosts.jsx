import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, getAgentPosition } from './layoutConfig';
import { createGlowTexture } from '../../utils/trigramTextures';
import { motion } from 'framer-motion';

/* ============================================================
   简化 Agent 符号
   - 单字符金色发光符号
   - 下方水平立场文字（不换行）
   - 活动时整体上浮 + 字符放大
   - 始终朝向相机 (Billboard)
============================================================ */
function AgentGhost({ agent, index, total, active, spoken, retreating, onClick }) {
  const groupRef = useRef();
  const symbolGroupRef = useRef();
  const glowRef = useRef();
  const { camera } = useThree();

  // 从 layoutConfig 取单字符（钱/路/风/心/镜/云/震/兑）
  const colorConfig = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
  const agentColor = { main: colorConfig.main, glow: colorConfig.glow };
  const symbol = colorConfig.name || agent.name?.[0] || '·';

  const glowTex = useMemo(() => createGlowTexture(agentColor.glow, 256), [agentColor.glow]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    const pos = getAgentPosition(index, total);
    const activeLift = active ? 0.3 : 0;
    const floatY = Math.sin(t * 0.5 + index) * 0.06;
    const scale = retreating ? 0.85 : (active ? 1.15 : 1.0);

    groupRef.current.position.x = pos.x;
    groupRef.current.position.y = pos.y + floatY + activeLift;
    groupRef.current.position.z = pos.z;
    groupRef.current.scale.setScalar(scale);

    // Billboard - 始终朝向相机
    if (symbolGroupRef.current) {
      symbolGroupRef.current.lookAt(camera.position);
    }

    // 光晕呼吸
    if (glowRef.current && glowRef.current.material) {
      const pulse = (active ? 0.6 : spoken ? 0.35 : 0.2) + Math.sin(t * 1.2 + index) * 0.08;
      glowRef.current.material.opacity = retreating ? 0.08 : pulse;
      const s = (active ? 1.4 : 1.0) + Math.sin(t * 1.5 + index) * 0.08;
      glowRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* 底部光晕 */}
      <mesh ref={glowRef} position={[0, -0.1, -0.05]}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial map={glowTex} color={agentColor.glow} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 字符符号 - 通过 Html 实现简单文字风格，单字符不换行 */}
      <group ref={symbolGroupRef}>
        <Html center distanceFactor={7} style={{ pointerEvents: 'auto' }}>
          <div
            onClick={(e) => { e.stopPropagation(); onClick?.(agent); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'default'; }}
            style={{
              fontFamily: '"Ma Shan Zheng", serif',
              fontSize: '42px',
              fontWeight: 600,
              color: agentColor.glow,
              textShadow: `0 0 14px ${agentColor.glow}, 0 0 28px ${agentColor.main}, 0 0 4px #000`,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              userSelect: 'none',
              opacity: retreating ? 0.55 : 1,
              transition: 'opacity 0.5s, transform 0.6s',
              lineHeight: 1,
              transform: active ? 'scale(1.2)' : 'scale(1)',
              whiteSpace: 'nowrap',
              minWidth: '42px',
              textAlign: 'center',
            }}
          >
            {symbol}
          </div>
        </Html>
      </group>

      {/* 立场标签 - 水平排版，不换行，与符号保持距离 */}
      <Html position={[0, -0.85, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            textAlign: 'center',
            color: agentColor.glow,
            fontFamily: '"Ma Shan Zheng", serif',
            opacity: retreating ? 0.5 : 1,
            transition: 'opacity 0.5s',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          <div
            style={{
              fontSize: '11px',
              letterSpacing: '0.3em',
              paddingLeft: '0.3em',
              textShadow: `0 0 6px ${agentColor.glow}, 0 0 2px #000`,
              opacity: active ? 1 : 0.75,
            }}
          >
            {agent.stance}
          </div>
          {/* 小勾 - 发言完成 */}
          {spoken && !retreating && (
            <div
              style={{
                fontSize: '9px',
                color: '#80C8A8',
                marginTop: '2px',
                textShadow: '0 0 4px #80C8A8',
              }}
            >
              ✓
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ============================================================
   Agent 容器
============================================================ */
export default function AgentGhosts({
  phase,
  activeAgentIdx,
  activeAgents,
  agentDialogues,
  onAgentClick,
}) {
  if (!['agent_debate', 'summary', 'branch_select', 'path_reveal', 'final'].includes(phase)) return null;

  const agents = (activeAgents || []).filter((a) => a.role !== 'master');
  if (agents.length === 0) return null;

  const retreating = ['summary', 'branch_select', 'path_reveal', 'final'].includes(phase);

  return (
    <group>
      {agents.map((agent, index) => (
        <AgentGhost
          key={agent.id}
          agent={agent}
          index={index}
          total={agents.length}
          active={phase === 'agent_debate' && activeAgentIdx === index}
          spoken={phase === 'agent_debate' && activeAgentIdx > index}
          retreating={retreating}
          onClick={onAgentClick}
        />
      ))}
    </group>
  );
}
