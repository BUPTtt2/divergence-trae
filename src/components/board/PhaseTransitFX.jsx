/* ============================================================
   【全新流程动画 1/3】阶段切换特效 PhaseTransitFX
   - 完全独立组件，不修改 LightOrb
   - phase 变化时：
     a) 中心卦符粒子向外爆炸（对应 phase 颜色 + 卦符纹理）
     b) 全局环境光脉冲闪烁（强度+颜色变化）
     c) 屏幕级 vignette 抖动（通过 emissive 脉冲模拟）
   ============================================================ */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// FIX: bufferAttribute 底层 WebGL buffer 创建时大小固定。
// 统一 MAX_PARTICLES = 700，避免不同 phase particleCount 不同导致
// "The size of the buffer attribute's array buffer does not match the original size"
const MAX_PARTICLES = 700;
const PHASE_CONFIG = {
  input:         { color: '#F0D890', particleCount: 300, pulse: 0.6, symbol: '☯' },
  casting:       { color: '#E8C890', particleCount: 420, pulse: 0.9, symbol: '☰' },
  analyzing:     { color: '#D4A870', particleCount: 400, pulse: 0.8, symbol: '䷊' },
  summoning:     { color: '#E0B888', particleCount: 480, pulse: 0.95, symbol: '☷' },
  yan_analyze:   { color: '#E8C878', particleCount: 500, pulse: 1.0, symbol: '䷀' },
  agent_select:  { color: '#C89878', particleCount: 450, pulse: 0.7, symbol: '䷯' },
  agent_debate:  { color: '#D8A8A8', particleCount: 500, pulse: 0.9, symbol: '䷪' },
  reflecting:    { color: '#C8A8E8', particleCount: 550, pulse: 1.0, symbol: '䷣' },
  summary:       { color: '#F0D090', particleCount: 560, pulse: 1.05, symbol: '䷥' },
  committing:    { color: '#D8B080', particleCount: 420, pulse: 0.75, symbol: '䷞' },
  oracle_prompt: { color: '#E0B878', particleCount: 440, pulse: 0.8, symbol: '䷂' },
  oracle:        { color: '#E8D080', particleCount: 620, pulse: 1.15, symbol: '䷀' },
  branch_select: { color: '#D0C0A0', particleCount: 480, pulse: 0.85, symbol: '䷂' },
  path_reveal:   { color: '#F0C0A0', particleCount: 520, pulse: 1.0, symbol: '䷄' },
  final:         { color: '#F5D898', particleCount: 650, pulse: 1.2, symbol: '䷾' },
  error:         { color: '#E88080', particleCount: 350, pulse: 0.5, symbol: '✕' },
};

/* 画一个卦符号 canvas texture */
function createGlyphTexture(symbol = '☰', color = '#F0D890', size = 128) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  // soft halo
  const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2);
  grd.addColorStop(0, color + 'FF');
  grd.addColorStop(0.25, color + '88');
  grd.addColorStop(0.5, color + '22');
  grd.addColorStop(1, color + '00');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  // symbol
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${size * 0.55}px "Ma Shan Zheng", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.1;
  ctx.fillText(symbol, cx, cy);
  return new THREE.CanvasTexture(c);
}

/* 爆炸粒子系统（每次 phase 变化时重置一次） */
function BurstParticles({ phase, onDone }) {
  const ref = useRef();
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG.input;
  const activeCount = cfg.particleCount;

  // FIX: 所有 phase 统一使用 MAX_PARTICLES 大小的 buffer，
  // 通过 setDrawRange(0, activeCount) 控制可见数量。
  // 避免不同 phase 粒子数不同导致 bufferAttribute WebGL 尺寸不匹配报错。
  const [positions, velocities, colors, sizes] = useMemo(() => {
    const p = new Float32Array(MAX_PARTICLES * 3);
    const v = new Float32Array(MAX_PARTICLES * 3);
    const c = new Float32Array(MAX_PARTICLES * 3);
    const s = new Float32Array(MAX_PARTICLES);
    const base = new THREE.Color(cfg.color);
    // 爆炸球体采样（仅填充前 activeCount 个）
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (i < activeCount) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const R = 0.05 + Math.random() * 0.15;
        p[i * 3]     = R * Math.sin(phi) * Math.cos(theta);
        p[i * 3 + 1] = R * Math.sin(phi) * Math.sin(theta) + 1.0;
        p[i * 3 + 2] = R * Math.cos(phi);
        const speed = 0.8 + Math.random() * 2.2;
        v[i * 3]     = speed * Math.sin(phi) * Math.cos(theta);
        v[i * 3 + 1] = speed * Math.sin(phi) * Math.sin(theta) * 0.6 + 0.6;
        v[i * 3 + 2] = speed * Math.cos(phi);
        c[i * 3]     = Math.min(1, base.r + (Math.random() - 0.5) * 0.15);
        c[i * 3 + 1] = Math.min(1, base.g + (Math.random() - 0.5) * 0.15);
        c[i * 3 + 2] = Math.min(1, base.b + (Math.random() - 0.5) * 0.15);
        s[i] = 0.04 + Math.random() * 0.07;
      } else {
        // 超出 activeCount 部分：放到远处不可见位置，速度0，透明度0
        p[i * 3]     = 0;
        p[i * 3 + 1] = -9999;
        p[i * 3 + 2] = 0;
        v[i * 3] = v[i * 3 + 1] = v[i * 3 + 2] = 0;
        c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0;
        s[i] = 0;
      }
    }
    return [p, v, c, s];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]); // activeCount 随 cfg 变化，但 phase 变化时 cfg 已变，已足够

  const texture = useMemo(() => createGlyphTexture(cfg.symbol, cfg.color, 128), [phase, cfg.symbol, cfg.color]);

  // 重置位置：phase 变化时重新初始化一次，并设置 drawRange
  const startTime = useRef(performance.now());
  useEffect(() => {
    startTime.current = performance.now();
    if (ref.current) {
      const geo = ref.current.geometry;
      geo.attributes.position.array.set(positions);
      geo.attributes.position.needsUpdate = true;
      geo.setDrawRange(0, activeCount); // 只渲染前 activeCount 个粒子
      ref.current.material.opacity = 0.95;
      ref.current.visible = true;
    }
  }, [phase, positions, activeCount]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const t = (performance.now() - startTime.current) / 1000;
    const posAttr = ref.current.geometry.attributes.position;
    const arr = posAttr.array;
    const life = 2.2; // 2.2s 生命周期
    if (t >= life) {
      ref.current.visible = false;
      if (onDone) onDone(phase);
      return;
    }
    // 更新粒子位置（只更新前 activeCount 个）
    for (let i = 0; i < activeCount; i++) {
      velocities[i * 3]     *= (1 - dt * 1.1);
      velocities[i * 3 + 1] *= (1 - dt * 1.1);
      velocities[i * 3 + 2] *= (1 - dt * 1.1);
      velocities[i * 3 + 1] -= dt * 0.4;
      arr[i * 3]     += velocities[i * 3]     * dt;
      arr[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      arr[i * 3 + 2] += velocities[i * 3 + 2] * dt;
    }
    posAttr.needsUpdate = true;
    const k = 1 - t / life;
    ref.current.material.opacity = Math.max(0, 0.95 * k * k);
    ref.current.material.sizeAttenuation = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={MAX_PARTICLES} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color"    count={MAX_PARTICLES} array={colors}    itemSize={3} />
        <bufferAttribute attach="attributes-size"     count={MAX_PARTICLES} array={sizes}     itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        map={texture}
        vertexColors
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* 环境光脉冲（每次 phase 切换时来一下） */
function AmbientPulse({ phase }) {
  const lightRef = useRef();
  const cfg = PHASE_CONFIG[phase] || PHASE_CONFIG.input;
  const startT = useRef(performance.now());
  useEffect(() => {
    startT.current = performance.now();
  }, [phase]);

  useFrame(() => {
    if (!lightRef.current) return;
    const t = (performance.now() - startT.current) / 1000;
    const life = 1.2;
    const k = Math.max(0, 1 - t / life);
    lightRef.current.intensity = 0.35 + cfg.pulse * 0.5 * k * k;
  });

  const color = useMemo(() => cfg.color, [cfg.color]);
  return <ambientLight ref={lightRef} color={color} intensity={0.35} />;
}

/* 组合组件：对外暴露 */
export default function PhaseTransitFX({ phase }) {
  return (
    <group>
      <BurstParticles phase={phase} />
      <AmbientPulse phase={phase} />
    </group>
  );
}
