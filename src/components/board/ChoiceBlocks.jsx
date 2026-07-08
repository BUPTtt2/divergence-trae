import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';
import { createGlowTexture, createRuneTexture } from '../../utils/trigramTextures';
import { motion, AnimatePresence } from 'framer-motion';

/* ============================================================
   单个选择方块 - 半透明虚影方块
   从用户脚下依次浮起，两侧展开
============================================================ */
function ChoiceBlock({ choice, index, total, selected, onSelect, phase }) {
  const groupRef = useRef();
  const plateRef = useRef();
  const glowRef = useRef();
  const [hovered, setHovered] = useState(false);

  const color = choice.glowColor || choice.color || COLORS.gold.light;
  const trigram = choice.icon || '☰';

  const runeTex = useMemo(() => createRuneTexture(trigram, {
    color: color,
    accentColor: color,
    size: 256,
    showName: false,
  }), [trigram, color]);

  const glowTex = useMemo(() => createGlowTexture(color, 256), [color]);

  // 位置：两侧展开（左 / 右 / 中前）
  const positions = useMemo(() => {
    // 围绕用户两侧扇形分布
    const radius = 2.2;
    const spread = Math.min(Math.PI * 0.8, Math.PI * 0.3 * total);
    const startAngle = -Math.PI / 2 - spread / 2;
    const step = total > 1 ? spread / (total - 1) : 0;
    const angle = startAngle + index * step;
    return {
      x: Math.sin(angle) * radius,
      y: 0.6,
      z: -Math.cos(angle) * radius * 0.5,
    };
  }, [index, total]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;

    // 入场延迟
    const enterDelay = index * 0.35;
    const enterT = Math.max(0, t - enterDelay);
    const enterProgress = Math.min(1, enterT / 0.8);
    const eased = 1 - Math.pow(1 - enterProgress, 3);

    // 从脚下浮起
    const startY = -0.5;
    const targetY = positions.y;
    const currentY = startY + (targetY - startY) * eased;

    groupRef.current.position.x = positions.x;
    groupRef.current.position.y = currentY + Math.sin(t * 0.5 + index) * 0.05;
    groupRef.current.position.z = positions.z;

    // 入场时缩放
    const scale = eased * (selected ? 1.15 : hovered ? 1.08 : 1.0);
    groupRef.current.scale.setScalar(scale);

    // 透明度
    if (groupRef.current.children[1]) {
      // plate
    }

    // 自转
    if (plateRef.current) {
      plateRef.current.rotation.y = t * 0.15;
    }

    // 光晕
    if (glowRef.current && glowRef.current.material) {
      const pulse = (selected ? 0.9 : hovered ? 0.7 : 0.4) + Math.sin(t * 1.5 + index) * 0.1;
      glowRef.current.material.opacity = pulse * eased;
      const s = (selected ? 1.4 : hovered ? 1.2 : 0.9) + Math.sin(t * 1.5 + index) * 0.1;
      glowRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* 底部光晕 */}
      <mesh ref={glowRef} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 1.3]} />
        <meshBasicMaterial map={glowTex} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 半透明方块 */}
      <mesh
        ref={plateRef}
        onClick={(e) => { e.stopPropagation(); onSelect?.(choice, index); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <boxGeometry args={[0.55, 0.55, 0.1]} />
        <meshStandardMaterial
          color={choice.color || color}
          emissive={color}
          emissiveIntensity={selected ? 1.2 : hovered ? 0.8 : 0.4}
          transparent
          opacity={selected ? 0.9 : hovered ? 0.8 : 0.65}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* 卦象图标 */}
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[0.42, 0.42]} />
        <meshBasicMaterial map={runeTex} transparent depthWrite={false} />
      </mesh>

      {/* 选中时中心亮点 */}
      {selected && (
        <mesh position={[0, 0, 0.08]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#FFF8E8" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {/* 选中时印泥 */}
      {selected && (
        <mesh position={[0.18, -0.18, 0.07]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color="#8B0000" transparent opacity={0.9} />
        </mesh>
      )}

      {/* 顶光 */}
      {(hovered || selected) && <pointLight color={color} intensity={0.6} distance={1.5} decay={2} position={[0, 0.3, 0]} />}

      {/* 标签 */}
      <Html position={[0, -0.7, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div style={{
          textAlign: 'center',
          color: selected ? '#FFF8E8' : color,
          fontFamily: '"Ma Shan Zheng", serif',
          textShadow: `0 0 8px ${color}, 0 0 4px #000`,
        }}>
          <div style={{
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '0.3em',
            paddingLeft: '0.3em',
          }}>
            {choice.label || choice.text || '选择'}
          </div>
          {choice.gua && (
            <div style={{
              fontSize: '9px',
              letterSpacing: '0.2em',
              marginTop: '3px',
              opacity: 0.7,
            }}>
              {choice.gua} 卦
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ============================================================
   选择方块容器
============================================================ */
export default function ChoiceBlocks({ phase, choices, onSelect, selectedChoice }) {
  if (!['branch_select', 'path_reveal', 'final'].includes(phase)) return null;
  if (!choices || choices.length === 0) return null;

  return (
    <group>
      {choices.map((choice, index) => (
        <ChoiceBlock
          key={choice.id || index}
          choice={choice}
          index={index}
          total={choices.length}
          selected={selectedChoice?.id === choice.id}
          onSelect={onSelect}
          phase={phase}
        />
      ))}
    </group>
  );
}
