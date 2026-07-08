import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS } from './layoutConfig';
import {
  createBaguaCompassTexture,
  createGlowTexture,
} from '../../utils/trigramTextures';

/* ============================================================
   八卦阵底座 - 水平躺地（不 billboard，保持原状）
   多层光晕 + 主体 + 旋转外环 + 缓慢上升粒子
============================================================ */
function BaguaCompass() {
  const ringRef = useRef();
  const glowRef = useRef();
  const glowRef2 = useRef();
  const innerRingRef = useRef();
  const ringGlowRef = useRef();
  const ringGlowSpriteRef = useRef();
  const innerRingSpriteRef = useRef();

  const compassTexture = useMemo(() => createBaguaCompassTexture(512), []);
  const glowTexture = useMemo(() => createGlowTexture(COLORS.gold.light, 256), []);
  // 面向屏幕的金色圆环贴图
  const ringSpriteTexture = useMemo(() => createRingSpriteTexture(256), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.06;
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -t * 0.1;
    }
    if (glowRef.current) {
      const pulse = 1 + Math.sin(t * 0.5) * 0.1;
      glowRef.current.scale.set(pulse, pulse, 1);
      glowRef.current.material.opacity = 0.35 + Math.sin(t * 0.4) * 0.08;
    }
    if (glowRef2.current) {
      const pulse = 1.4 + Math.sin(t * 0.3) * 0.18;
      glowRef2.current.scale.set(pulse, pulse, 1);
      glowRef2.current.material.opacity = 0.18 + Math.sin(t * 0.2) * 0.06;
    }
    if (ringGlowRef.current) {
      const pulse = 1 + Math.sin(t * 0.7) * 0.08;
      ringGlowRef.current.scale.set(pulse, pulse, 1);
      if (ringGlowRef.current.material) {
        ringGlowRef.current.material.opacity = 0.55 + Math.sin(t * 0.6) * 0.15;
      }
    }
    // sprite ring - 始终面向屏幕
    if (ringGlowSpriteRef.current) {
      const pulse = 1 + Math.sin(t * 0.7) * 0.08;
      ringGlowSpriteRef.current.scale.set(pulse * 1.5, pulse * 1.5, 1);
      if (ringGlowSpriteRef.current.material) {
        ringGlowSpriteRef.current.material.opacity = 0.65 + Math.sin(t * 0.6) * 0.15;
      }
    }
    if (innerRingSpriteRef.current) {
      innerRingSpriteRef.current.scale.set(0.7, 0.7, 1);
      if (innerRingSpriteRef.current.material) {
        innerRingSpriteRef.current.material.opacity = 0.5 + Math.sin(t * 0.4) * 0.1;
      }
    }
  });

  return (
    <group>
      {/* 水平躺地层: 最外层大气光晕 + 外层光晕 + 外圈卦象 */}
      <group position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh ref={glowRef2} position={[0, 0, -0.15]}>
          <planeGeometry args={[4.5, 4.5]} />
          <meshBasicMaterial map={glowTexture} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={glowRef} position={[0, 0, -0.05]}>
          <planeGeometry args={[3.0, 3.0]} />
          <meshBasicMaterial map={glowTexture} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={ringRef}>
          <planeGeometry args={[2.3, 2.3]} />
          <meshBasicMaterial map={compassTexture} transparent depthWrite={false} blending={THREE.NormalBlending} />
        </mesh>
        <mesh ref={innerRingRef}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={compassTexture} transparent opacity={0.5} depthWrite={false} blending={THREE.NormalBlending} />
        </mesh>
      </group>

      {/* 删除了面对屏幕的金色圆环 sprite - 与八卦阵重叠 */}
    </group>
  );
}

/* 创建圆环 sprite 贴图 - 始终面向屏幕 */
function createRingSpriteTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  // 外环
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(240, 216, 144, 0.9)';
  ctx.lineWidth = size * 0.04;
  ctx.stroke();
  // 内环
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(240, 216, 144, 0.5)';
  ctx.lineWidth = size * 0.012;
  ctx.stroke();
  // 8 个方位小光点
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * size * 0.44;
    const y = cy + Math.sin(a) * size * 0.44;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240, 216, 144, 0.95)';
    ctx.shadowColor = 'rgba(240, 216, 144, 0.9)';
    ctx.shadowBlur = size * 0.04;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  return new THREE.CanvasTexture(c);
}

/* ============================================================
   中心小符号 - Canvas 画一个水墨"演"字 + 微弱光晕
   颜色: 宣纸白 (与底部八卦呼应的米白色, 不纯黑)
============================================================ */
function createYanSymbolTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  // 中心墨字 - 用淡墨色 (深灰, 不是纯黑) - 在暗背景下清晰
  ctx.font = `500 ${size * 0.72}px "Ma Shan Zheng", "演示佛系体", "STKaiti", "KaiTi", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(240, 235, 221, 0.6)';
  ctx.shadowBlur = size * 0.08;
  ctx.fillStyle = 'rgba(240, 235, 221, 0.96)';
  ctx.fillText('演', cx, cy + size * 0.04);

  // 朱砂角印 (右下角小方块)
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(220, 110, 70, 0.85)';
  ctx.fillRect(cx + size * 0.28, cy + size * 0.28, size * 0.07, size * 0.07);

  return new THREE.CanvasTexture(c);
}

function createYanGlowTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  // 暖色光晕 (淡朱砂向外扩散)
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  g.addColorStop(0, 'rgba(240, 220, 180, 0.5)');
  g.addColorStop(0.4, 'rgba(220, 170, 120, 0.18)');
  g.addColorStop(1, 'rgba(220, 170, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/* 小符号贴图 - 围绕"演"字的 4 个悬浮水墨符 (天/地/雷/风), 始终面向屏幕 */
function createOrbGlyph(ch, size = 96) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.font = `500 ${size * 0.7}px "Ma Shan Zheng", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 暖光晕
  ctx.shadowColor = 'rgba(240, 216, 144, 0.7)';
  ctx.shadowBlur = size * 0.18;
  ctx.fillStyle = 'rgba(240, 220, 170, 0.95)';
  ctx.fillText(ch, size / 2, size / 2 + size * 0.04);
  return new THREE.CanvasTexture(c);
}

function CenterSymbol({ phase }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const symTex = useMemo(() => createYanSymbolTexture(256), []);
  const glowTex = useMemo(() => createYanGlowTexture(256), []);

  const showLarge = phase === 'input' || phase === 'analyzing' || phase === 'summoning';

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      const breath = 1 + Math.sin(t * 0.5) * 0.05;
      groupRef.current.scale.setScalar(breath);
    }
    if (glowRef.current && glowRef.current.material) {
      const pulse = 1 + Math.sin(t * 0.7) * 0.15;
      glowRef.current.scale.set(pulse, pulse, 1);
      glowRef.current.material.opacity = 0.5 + Math.sin(t * 0.5) * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <sprite ref={glowRef} scale={[2.4, 2.4, 1]}>
        <spriteMaterial map={glowTex} transparent depthWrite={false} opacity={0.5} blending={THREE.NormalBlending} />
      </sprite>
      <sprite scale={[showLarge ? 0.9 : 0.6, showLarge ? 0.9 : 0.6, 1]}>
        <spriteMaterial map={symTex} transparent depthWrite={false} opacity={0.95} />
      </sprite>
    </group>
  );
}

/* ============================================================
   环绕 3D 卦象粒子 - 8 个卦象沿主体圆周运动
   根据 phase 调整: 旋转速度 / 半径 / 明灭
   - input:        慢, 半径 0.62, 不明灭
   - analyzing:    中, 半径 0.7
   - summoning:    快, 半径 0.85, 明灭
   - agent_debate: 最快, 半径 0.95, 强明灭
   - summary:      收回, 半径 0.7
   - branch_select: 半径 0.62
   - path_reveal:  半径 0.65
   - final:        半径 0.55 (让位给命运卡)
============================================================ */
function OrbitTrigrams({ phase }) {
  const groupRef = useRef();
  const trigramRefs = useRef([]);

  const trigrams = useMemo(() => ['☰', '☱', '☲', '☳', '☷', '☵', '☶', '☴'], []);

  // phase → 参数 (target)
  const phaseParams = {
    input:         { rotSpeed: 0.18, radius: 0.62, twinkle: 0.0 },
    analyzing:     { rotSpeed: 0.30, radius: 0.72, twinkle: 0.15 },
    summoning:     { rotSpeed: 0.55, radius: 0.86, twinkle: 0.55 },
    casting:       { rotSpeed: 0.40, radius: 0.78, twinkle: 0.30 },
    reflecting:    { rotSpeed: 0.65, radius: 0.92, twinkle: 0.65 },
    committing:    { rotSpeed: 0.45, radius: 0.80, twinkle: 0.25 },
    agent_debate:  { rotSpeed: 0.75, radius: 0.96, twinkle: 0.80 },
    summary:       { rotSpeed: 0.40, radius: 0.74, twinkle: 0.20 },
    branch_select: { rotSpeed: 0.25, radius: 0.65, twinkle: 0.10 },
    path_reveal:   { rotSpeed: 0.30, radius: 0.68, twinkle: 0.18 },
    final:         { rotSpeed: 0.18, radius: 0.55, twinkle: 0.0 },
  };

  // 平滑插值器 (避免突跳)
  const lerpRef = useRef({ rotSpeed: 0.18, radius: 0.62, twinkle: 0.0 });
  useFrame((_, delta) => {
    lerpRef.current.rotSpeed += (targetParams().rotSpeed - lerpRef.current.rotSpeed) * Math.min(1, delta * 1.5);
    lerpRef.current.radius   += (targetParams().radius   - lerpRef.current.radius)   * Math.min(1, delta * 1.5);
    lerpRef.current.twinkle  += (targetParams().twinkle  - lerpRef.current.twinkle)  * Math.min(1, delta * 1.5);
  });
  function targetParams() {
    return phaseParams[phase] || phaseParams.input;
  }

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!groupRef.current) return;
    const p = lerpRef.current;
    groupRef.current.rotation.y = t * p.rotSpeed;
    trigramRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const angle = (i / 8) * Math.PI * 2 + t * (p.rotSpeed * 1.2);
      const yOscillation = Math.sin(t * 0.6 + i) * 0.05;
      mesh.position.x = Math.cos(angle) * p.radius;
      mesh.position.z = Math.sin(angle) * p.radius;
      mesh.position.y = yOscillation;
      mesh.lookAt(groupRef.current.position);
      // 明灭: 每个卦象按时间偏移闪烁
      if (mesh.material) {
        const twinkle = 0.6 + Math.sin(t * (3 + p.twinkle * 8) + i * 0.7) * 0.4 * p.twinkle;
        mesh.material.opacity = 0.85 - twinkle * 0.4;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {trigrams.map((tg, i) => (
        <mesh key={i} ref={(el) => (trigramRefs.current[i] = el)}>
          <planeGeometry args={[0.12, 0.12]} />
          <meshBasicMaterial
            color={'#F0D890'}
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
          <Html
            center
            transform
            distanceFactor={2.5}
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                color: '#F0D890',
                fontSize: '20px',
                fontWeight: 600,
                fontFamily: '"Ma Shan Zheng", serif',
                textShadow: '0 0 10px rgba(240,216,144,0.9), 0 0 4px rgba(240,216,144,0.6)',
                userSelect: 'none',
              }}
            >
              {tg}
            </div>
          </Html>
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
   三枚水墨铜钱 - analyzing 阶段
   位置: 右上角悬浮 (右上, 离"演"远), 始终面向屏幕
============================================================ */
function CoinRitual({ visible }) {
  const groupRef = useRef();
  const coinRefs = [useRef(), useRef(), useRef()];

  const coinTex = useMemo(() => {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size);

    // 外圆: 宣纸底色 + 水墨晕染边
    const outerR = size * 0.42;
    const grad = ctx.createRadialGradient(cx, cy - size * 0.06, size * 0.05, cx, cy, outerR);
    grad.addColorStop(0, '#F5E6C8');
    grad.addColorStop(0.5, '#E8D098');
    grad.addColorStop(0.85, '#C49A5C');
    grad.addColorStop(1, '#8A6A30');
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 水墨斑驳纹理
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * outerR * 0.9;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fillStyle = '#5A3A1A';
      ctx.fill();
    }
    ctx.restore();

    // 内圈凹线
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90, 58, 26, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 内方孔 - 朱砂红 + 水墨晕染
    const holeSize = size * 0.14;
    ctx.save();
    ctx.shadowColor = 'rgba(168, 71, 46, 0.6)';
    ctx.shadowBlur = size * 0.04;
    ctx.fillStyle = '#A8472E';
    ctx.fillRect(cx - holeSize / 2, cy - holeSize / 2, holeSize, holeSize);
    ctx.restore();

    // 方孔内圈线
    ctx.strokeStyle = 'rgba(60, 20, 10, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - holeSize / 2, cy - holeSize / 2, holeSize, holeSize);

    // 上下两个卦文 (仿古钱币)
    ctx.font = `600 ${size * 0.13}px "Ma Shan Zheng", "STKaiti", serif`;
    ctx.fillStyle = 'rgba(90, 58, 26, 0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('乾', cx, cy - outerR * 0.48);
    ctx.fillText('坤', cx, cy + outerR * 0.48);

    // 外边缘水墨晕染
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const edgeGrad = ctx.createRadialGradient(cx, cy, outerR * 0.9, cx, cy, outerR);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(60, 40, 20, 0.35)');
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = edgeGrad;
    ctx.fill();
    ctx.restore();

    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    if (!visible || !groupRef.current) return;
    const t = clock.getElapsedTime();
    coinRefs.forEach((ref, i) => {
      if (!ref.current) return;
      const settleTime = 2.0;
      if (t < settleTime) {
        const progress = t / settleTime;
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        ref.current.rotation.z = (1 - easeProgress) * (4 + i * 1.5) + easeProgress * 0;
        ref.current.position.y = Math.sin(t * 4 + i * 1.2) * 0.25 * (1 - easeProgress);
        ref.current.material.opacity = 0.6 + easeProgress * 0.36;
      } else {
        const st = t - settleTime;
        ref.current.rotation.z = Math.sin(st * 0.8 + i * 0.7) * 0.03;
        ref.current.position.y = Math.sin(st * 1.0 + i * 0.6) * 0.05;
        ref.current.material.opacity = 0.92 + Math.sin(st * 0.6 + i) * 0.04;
      }
    });
  });

  if (!visible) return null;

  return (
    <group ref={groupRef} position={[1.5, 1.0, 0.3]}>
      {coinRefs.map((ref, i) => (
        <sprite
          key={i}
          ref={ref}
          position={[(i - 1) * 0.32, 0, (i - 1) * 0.08]}
          scale={[0.38, 0.38, 1]}
        >
          <spriteMaterial
            map={coinTex}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/* ============================================================
   罗盘指针 - summoning 阶段
============================================================ */
function CompassNeedle({ visible, agentCount }) {
  const needleRef = useRef();

  useFrame(({ clock }) => {
    if (!visible || !needleRef.current) return;
    const t = clock.getElapsedTime();
    const idx = Math.floor(t / 0.8) % Math.max(1, agentCount);
    const target = (idx / Math.max(1, agentCount)) * Math.PI * 2;
    const current = needleRef.current.rotation.z;
    needleRef.current.rotation.z = current + (target - current) * 0.1;
  });

  if (!visible) return null;

  return (
    <group position={[0, 0, 0]}>
      <mesh ref={needleRef} position={[0, 0, 0.01]}>
        <planeGeometry args={[0.04, 0.8]} />
        <meshBasicMaterial color={'#F0D890'} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.35, 0.02]}>
        <coneGeometry args={[0.06, 0.12, 4]} />
        <meshStandardMaterial color={'#F0D890'} emissive={'#C8A050'} emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

/* ============================================================
   紫微斗数盘 - summary 阶段
============================================================ */
function ZiweiDisk({ visible }) {
  const ring1Ref = useRef();
  const ring2Ref = useRef();

  const diskTex = useMemo(() => {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2, cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#F0D890';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * size * 0.45, cy + Math.sin(a) * size * 0.45);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    const palaces = ['命', '兄', '夫', '子', '财', '疾', '迁', '奴', '官', '田', '福', '父'];
    ctx.font = '600 11px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#F0D890';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    palaces.forEach((p, i) => {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * size * 0.375;
      const y = cy + Math.sin(a) * size * 0.375;
      ctx.fillText(p, x, y);
    });
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame(({ clock }) => {
    if (!visible) return;
    const t = clock.getElapsedTime();
    if (ring1Ref.current) ring1Ref.current.rotation.z = t * 0.15;
    if (ring2Ref.current) ring2Ref.current.rotation.z = -t * 0.25;
  });

  if (!visible) return null;

  return (
    <group position={[0, 0, 0.05]}>
      <mesh ref={ring1Ref}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshBasicMaterial map={diskTex} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 0, 0.01]}>
        <ringGeometry args={[0.4, 0.45, 32]} />
        <meshBasicMaterial color={'#F0D890'} transparent opacity={0.6} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ============================================================
   流动粒子 - analyzing 飞向中心 / summary 环绕
============================================================ */
function FlowParticles({ phase }) {
  const groupRef = useRef();
  const PARTICLE_COUNT = 40;
  const particles = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      radius: 1.0 + Math.random() * 0.5,
      speed: 0.2 + Math.random() * 0.3,
      yPhase: Math.random() * Math.PI * 2,
    }));
  }, []);

  const particleTex = useMemo(() => createGlowTexture('#F0D890', 64), []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.children.forEach((child, i) => {
      if (!child || !child.material) return;
      const p = particles[i];
      if (!p) return;
      if (phase === 'analyzing') {
        const cycle = (t * p.speed + p.angle) % (Math.PI * 2);
        const progress = (Math.sin(t * 0.5 + i * 0.3) + 1) / 2;
        const r = p.radius * (1 - progress * 0.8);
        child.position.x = Math.cos(cycle) * r;
        child.position.z = Math.sin(cycle) * r;
        child.position.y = Math.sin(t * 0.6 + p.yPhase) * 0.2;
        child.material.opacity = 0.6 * (1 - progress * 0.7);
        const s = 0.05 * (1 - progress * 0.5);
        child.scale.setScalar(Math.max(0.01, s));
      } else if (phase === 'summary') {
        const a = p.angle + t * 0.5;
        const r = 0.5 + Math.sin(t + i) * 0.05;
        child.position.x = Math.cos(a) * r;
        child.position.z = Math.sin(a) * r;
        child.position.y = Math.sin(t * 0.8 + p.yPhase) * 0.15;
        child.material.opacity = 0.7 + Math.sin(t * 2 + i) * 0.2;
        const s = 0.06 + Math.sin(t * 2 + i) * 0.02;
        child.scale.setScalar(Math.max(0.01, s));
      } else {
        child.material.opacity = 0;
      }
    });
  });

  if (phase !== 'analyzing' && phase !== 'summary' && phase !== 'reflecting') return null;

  return (
    <group ref={groupRef} position={[0, 1.5, 0]}>
      {particles.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial map={particleTex} color={'#F0D890'} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
   八字命运卡 - final 阶段
   真实卦辞 + 太极图 + 月柱/日柱/时柱 + 终局签文
============================================================ */
function FateCard({ visible, choice, activeAgents, inference }) {
  const cardRef = useRef();

  // 根据 inference / 选择生成卦象数据 - 用 LLM 生成的真实卦象/签文
  const fate = useMemo(() => {
    const choiceId = choice?.id || 'opportunity';
    // 兜底映射 - 仅在 inference 缺失或没有真实卦象时使用
    const fallbackMap = {
      opportunity: { gua: '大有', trigram: '☰', verse: '元亨。柔得尊位,大亨以正。', result: '所求可成', element: '火' },
      risk:        { gua: '坎',  trigram: '☵', verse: '习坎,有孚,维心亨。行有尚。', result: '险中求通', element: '水' },
      stable:      { gua: '艮',  trigram: '☶', verse: '艮其背,不获其身。行其庭,不见其人。', result: '静守其道', element: '山' },
      explore:     { gua: '巽',  trigram: '☴', verse: '小亨,利有攸往。利见大人。', result: '风行万里', element: '风' },
    };
    // 优先用 inference 提供的真实卦象 + 签文
    const realGua = inference?.gua;
    const realVerse = inference?.verse;
    const baseGua = realGua
      ? {
          gua: realGua.gua || fallbackMap[choiceId]?.gua || '乾',
          trigram: realGua.trigram || fallbackMap[choiceId]?.trigram || '☰',
          element: realGua.element || fallbackMap[choiceId]?.element || '天',
          verse: realVerse || fallbackMap[choiceId]?.verse,
          result: realGua.element ? `${realGua.element}行所归` : (fallbackMap[choiceId]?.result || '吉'),
        }
      : fallbackMap[choiceId] || fallbackMap.opportunity;

    // 八字四柱 (基于当前时间 + 选择种子)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const pillar = (n) => stems[n % 10] + branches[n % 12];
    const yearPillar = pillar(year + 4);
    const monthPillar = pillar(month + year);
    const dayPillar = pillar(day + month * 3);
    const hourPillar = pillar(hour + day * 2);

    // 智囊名 - 列出参与辩论的 Agent
    const advisors = (activeAgents || [])
      .filter((a) => a.role !== 'master')
      .map((a) => a.name)
      .join('、');

    return {
      ...baseGua,
      pillars: { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar },
      advisors,
      // 3 件实用品 - 让命运卡成为推演成果的最终归属
      powerfulQuestion: inference?.powerfulQuestion || '',
      framework: inference?.framework || '',
      question: inference?.question || '',
      date: `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`,
      time: `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    };
  }, [choice, activeAgents, inference]);

  // 卡片纹理 - 重新设计:卦象 + 3 件实用品(反问/框架/签)
  const cardTex = useMemo(() => {
    const w = 360, h = 720;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    // 背景:水墨宣纸 + 深褐底
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, 'rgba(28, 22, 14, 0.96)');
    bgGrad.addColorStop(0.5, 'rgba(18, 14, 8, 0.96)');
    bgGrad.addColorStop(1, 'rgba(8, 6, 4, 0.96)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 宣纸纹理 (随机点)
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(200, 168, 80, ${Math.random() * 0.04})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }

    // 外框:克制水墨细线 (单线 + 微光晕, 不再金色双线环绕)
    ctx.strokeStyle = '#7A6A50';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(200, 168, 80, 0.18)';
    ctx.shadowBlur = 4;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.shadowBlur = 0;

    // 顶部细线 (装饰分隔, 不再金色)
    ctx.strokeStyle = 'rgba(122, 106, 80, 0.5)';
    ctx.beginPath();
    ctx.moveTo(40, 88);
    ctx.lineTo(w - 40, 88);
    ctx.stroke();

    // ============== 头部:标题 + 日期 ==============
    ctx.font = '600 22px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#F0D890';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#C8A850';
    ctx.shadowBlur = 10;
    ctx.fillText('天 命 所 归', w / 2, 50);
    ctx.shadowBlur = 0;

    ctx.font = '10px "Noto Serif SC", serif';
    ctx.fillStyle = '#A08860';
    ctx.fillText(`${fate.date}  ${fate.time}`, w / 2, 70);

    // ============== 太极图 ==============
    const tcX = w / 2, tcY = 152, tcR = 36;
    ctx.fillStyle = '#F0D890';
    ctx.beginPath();
    ctx.arc(tcX, tcY, tcR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1410';
    ctx.beginPath();
    ctx.arc(tcX, tcY, tcR, Math.PI / 2, Math.PI * 1.5, true);
    ctx.fill();
    ctx.fillStyle = '#F0D890';
    ctx.beginPath();
    ctx.arc(tcX, tcY - tcR / 2, tcR / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1410';
    ctx.beginPath();
    ctx.arc(tcX, tcY + tcR / 2, tcR / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1A1410';
    ctx.beginPath();
    ctx.arc(tcX, tcY + tcR / 2, tcR * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#C8A850';
    ctx.beginPath();
    ctx.arc(tcX, tcY - tcR / 2, tcR * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // 太极周围 8 卦
    const microTrigrams = ['☰', '☱', '☲', '☳', '☷', '☵', '☶', '☴'];
    ctx.font = '11px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#C8A850';
    microTrigrams.forEach((t, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = tcX + Math.cos(a) * (tcR + 14);
      const y = tcY + Math.sin(a) * (tcR + 14);
      ctx.fillText(t, x, y);
    });

    // ============== 卦名 + 五行 ==============
    ctx.font = '700 38px "Ma Shan Zheng", serif';
    ctx.fillStyle = '#F0D890';
    ctx.shadowColor = '#C8A850';
    ctx.shadowBlur = 14;
    ctx.fillText(fate.gua, w / 2, 240);
    ctx.shadowBlur = 0;

    ctx.font = '11px "Noto Serif SC", serif';
    ctx.fillStyle = '#A08860';
    ctx.fillText(`五行属 ${fate.element}`, w / 2, 262);

    // 卦辞
    ctx.font = '500 12px "Noto Serif SC", serif';
    ctx.fillStyle = '#E8D88A';
    const verseLines = wrapText(ctx, fate.verse, w - 80);
    verseLines.forEach((line, i) => {
      ctx.fillText(line, w / 2, 290 + i * 18);
    });

    // 中部分隔
    let y = 290 + verseLines.length * 18 + 18;
    ctx.strokeStyle = '#C8A85060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 40, y);
    ctx.stroke();
    y += 20;

    // ============== 3 件实用品 ==============
    const drawArtifact = (label, content, opts = {}) => {
      const { fontSize = 12, color = '#E8D88A', italic = false, lineHeight = 18 } = opts;
      // 标签
      ctx.font = '600 9px "Noto Serif SC", serif';
      ctx.fillStyle = '#A08860';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, y);
      y += 14;
      // 内容 (换行)
      ctx.font = `${italic ? 'italic ' : ''}${fontSize}px "Noto Serif SC", serif`;
      ctx.fillStyle = color;
      const lines = wrapText(ctx, content, w - 80);
      lines.forEach((line) => {
        ctx.fillText(line, w / 2, y);
        y += lineHeight;
      });
      y += 12;
    };

    if (fate.powerfulQuestion) {
      drawArtifact('一 句 反 问', fate.powerfulQuestion, {
        fontSize: 14, color: '#F0D890', lineHeight: 20,
      });
    }
    if (fate.framework) {
      drawArtifact('决 策 框 架', fate.framework, {
        fontSize: 12, color: '#E0DDD5', lineHeight: 18,
      });
    }
    if (fate.verse) {
      drawArtifact('终 局 之 签', fate.verse, {
        fontSize: 14, color: '#F0D890', italic: true, lineHeight: 20,
      });
    }

    // ============== 底部:四柱 + 智囊 ==============
    y = Math.max(y + 6, 580);
    ctx.strokeStyle = '#C8A85060';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 40, y);
    ctx.stroke();
    y += 18;

    ctx.font = '9px "Noto Serif SC", serif';
    ctx.fillStyle = '#807870';
    ctx.fillText('四 柱', w / 2, y);
    y += 16;

    const pillars = [fate.pillars.year, fate.pillars.month, fate.pillars.day, fate.pillars.hour];
    const colW = (w - 80) / 4;
    pillars.forEach((p, i) => {
      const x = 40 + colW * (i + 0.5);
      ctx.font = '600 20px "Ma Shan Zheng", serif';
      ctx.fillStyle = '#F0D890';
      ctx.textAlign = 'center';
      ctx.fillText(p, x, y);
    });
    y += 22;

    // 智囊之议
    if (fate.advisors) {
      ctx.font = '9px "Noto Serif SC", serif';
      ctx.fillStyle = '#807870';
      const advLines = wrapText(ctx, `智囊:${fate.advisors}`, w - 60);
      advLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, y + i * 13);
      });
    }

    return new THREE.CanvasTexture(c);
  }, [fate]);

  useFrame(({ clock }) => {
    if (!visible || !cardRef.current) return;
    const t = clock.getElapsedTime();
    cardRef.current.position.x = -2.4 + Math.sin(t * 0.4) * 0.04;
    cardRef.current.position.y = 2.4 + Math.sin(t * 0.5) * 0.06;
    cardRef.current.position.z = 0.2;
    cardRef.current.rotation.y = Math.sin(t * 0.3) * 0.06;
  });

  if (!visible) return null;

  return (
    <group ref={cardRef}>
      <mesh>
        <planeGeometry args={[1.5, 3.0]} />
        <meshBasicMaterial map={cardTex} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/**
 * 文本换行辅助
 */
function wrapText(ctx, text, maxWidth) {
  const chars = text.split('');
  const lines = [];
  let current = '';
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ============================================================
   光球主组 - 中心符号 + 各种阶段特效
============================================================ */
export default function LightOrb({ phase, position = [0, 1.5, 0], selectedChoice, activeAgents, inference }) {
  const mainGroupRef = useRef();
  const labelGroupRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (mainGroupRef.current) {
      mainGroupRef.current.position.y = position[1] + Math.sin(t * 0.3) * 0.06;
    }
  });

  const showCoins = phase === 'analyzing';
  const showNeedle = phase === 'summoning';
  const showDisk = phase === 'summary';
  const showFate = phase === 'final';

  return (
    <group>
      {/* 底部八卦阵 - 水平躺地 */}
      <BaguaCompass />

      {/* 流动粒子 - 阶段化显示 */}
      <FlowParticles phase={phase} />

      {/* 命运卡 - 最终阶段 - 偏左上 */}
      <FateCard visible={showFate} choice={selectedChoice} activeAgents={activeAgents} inference={inference} />

      {/* 中心: 小符号 + 微弱光晕 + 阶段道具 - final 阶段让位给命运卡 */}
      {phase !== 'final' && (
        <group ref={mainGroupRef} position={position}>
          {/* 中心小符号 - sprite 始终面向屏幕 */}
          <CenterSymbol phase={phase} />

          {/* 环绕 8 卦象 */}
          <OrbitTrigrams phase={phase} />

          {/* 六爻铜钱 - 分析阶段 */}
          <CoinRitual visible={showCoins} />

          {/* 罗盘指针 - 召唤阶段 */}
          <CompassNeedle visible={showNeedle} agentCount={(activeAgents || []).filter(a => a.role !== 'master').length || 4} />

          {/* 紫微斗数盘 - 总结阶段 */}
          <ZiweiDisk visible={showDisk} />
        </group>
      )}

      {/* 演 字标签 - 只在 agent_debate 时显示(避免与 summary 对话框重叠) */}
      {phase === 'agent_debate' && (
        <group ref={labelGroupRef} position={[position[0], position[1] + 0.7, position[2]]}>
          <Html center distanceFactor={9} style={{ pointerEvents: 'none' }}>
            <div style={{
              color: '#F0D890',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.4em',
              textShadow: '0 0 10px #C8A050, 0 0 4px #000',
              paddingLeft: '0.4em',
            }}>
              演
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}
