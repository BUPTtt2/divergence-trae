import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, getAgentPosition } from './layoutConfig';
import { createGlowTexture } from '../../utils/trigramTextures';

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

  // 从 layoutConfig 取识别符；场景只显示轻量名牌，完整内容进入工作台。
  const colorConfig = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
  const agentColor = { main: colorConfig.main, glow: colorConfig.glow };
  const symbol = colorConfig.name || agent.trigram || agent.agentName?.[0] || agent.name?.[0] || '·';
  const displayName = agent.agentName || agent.name || agent.id || '智囊';

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

      {/* 字形本身就是智囊入口：视觉无框，点击热区保留完整尺寸。 */}
      <group ref={symbolGroupRef}>
        <Html center distanceFactor={8.5} style={{ pointerEvents: 'auto' }}>
          <button
            type="button"
            className="agent-ghost-sigil"
            data-active={active ? 'true' : 'false'}
            data-spoken={spoken ? 'true' : 'false'}
            onClick={(e) => { e.stopPropagation(); onClick?.(agent); }}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'default'; }}
            style={{
              '--agent-color': agentColor.main,
              '--agent-glow': agentColor.glow,
              opacity: retreating ? 0.55 : 1,
            }}
          >
            <span className="agent-ghost-sigil__glyph" aria-hidden="true">{symbol}</span>
            <span className="agent-ghost-sigil__name">{displayName}</span>
            <small>{active ? '正在判断' : spoken ? '判断已到 · 点击查看' : '点击查看 / 对话'}</small>
            <i aria-hidden="true" />
          </button>
        </Html>
      </group>

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
          key={`${agent.id}__idx${index}`}
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
