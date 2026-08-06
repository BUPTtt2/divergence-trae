/* ============================================================
   【全新流程动画 3/3】命牌 3D 翻牌 DestinyRevealFX
   - 仅在 phase=path_reveal / final 时激活
   - 动画分 5 段：
     1. 升起：牌从地下(-y)升到正前方(y=0.3, z=0.2)
     2. 翻牌：Y 轴 180° 翻开（背面 → 正面）
     3. 定住：牌面稳定，朱砂印出现
     4. 光晕：牌周围出现金色光晕粒子
     5. 悬浮：轻微上下浮动，保持微旋转
   - 牌面使用 canvas 纹理（卦象名 + 关键字 + 朱砂印）
   ============================================================ */
import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* 生成命牌正面纹理 */
function createCardFrontTexture({
  guaName = '大有',
  guaIcon = '☰',
  summary = '元亨',
  key1 = '天垂象',
  key2 = '利有攸往',
  key3 = '君子自强',
  color = '#B83828',
}) {
  const W = 512, H = 768;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // 1. 背景：宣纸渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#F3E9D2');
  bg.addColorStop(0.5, '#F0E4C6');
  bg.addColorStop(1, '#E6D4AE');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 2. 边框 (双框)
  ctx.strokeStyle = '#9A6A38';
  ctx.lineWidth = 5;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  // 3. 卦象大字 + 符号
  ctx.fillStyle = '#3A2414';
  ctx.font = `800 ${W * 0.18}px "Ma Shan Zheng", "STKaiti", serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillText(guaName, W / 2, H * 0.18);
  ctx.shadowBlur = 0;
  // 卦象符号(更大)
  ctx.font = `700 ${W * 0.24}px "Ma Shan Zheng", serif`;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fillText(guaIcon, W / 2, H * 0.34);
  ctx.globalAlpha = 1;
  // 4. 卦辞
  ctx.fillStyle = '#4A3018';
  ctx.font = `600 ${W * 0.06}px "Ma Shan Zheng", "STKaiti", serif`;
  ctx.fillText('卦  辞', W / 2, H * 0.48);
  ctx.font = `500 ${W * 0.052}px "STKaiti", "KaiTi", serif`;
  ctx.fillStyle = '#6A4020';
  ctx.fillText(summary.slice(0, 12), W / 2, H * 0.54);
  // 5. 三行关键要点（每行带前缀·）
  const kY0 = H * 0.64;
  const kGap = H * 0.075;
  ctx.fillStyle = '#4A3018';
  ctx.font = `500 ${W * 0.045}px "Ma Shan Zheng", "STKaiti", serif`;
  ctx.textAlign = 'left';
  [key1, key2, key3].forEach((k, i) => {
    ctx.fillStyle = color;
    ctx.fillText('·', W * 0.18, kY0 + kGap * i);
    ctx.fillStyle = '#3A2414';
    ctx.fillText(String(k || '').slice(0, 12), W * 0.22, kY0 + kGap * i);
  });
  ctx.textAlign = 'center';
  // 6. 朱砂印（右下角）
  const sealSize = W * 0.16;
  const sx = W * 0.78 - sealSize / 2;
  const sy = H * 0.88 - sealSize / 2;
  ctx.save();
  ctx.translate(sx + sealSize / 2, sy + sealSize / 2);
  ctx.rotate(-0.08);
  ctx.strokeStyle = '#B23420';
  ctx.lineWidth = 5;
  ctx.fillStyle = 'rgba(178,52,32,0.86)';
  ctx.shadowColor = '#B23420';
  ctx.shadowBlur = 6;
  ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
  ctx.strokeRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFF4E0';
  ctx.font = `700 ${sealSize * 0.4}px "Ma Shan Zheng", serif`;
  ctx.fillText('演', 0, -sealSize * 0.12);
  ctx.font = `500 ${sealSize * 0.28}px "STKaiti", serif`;
  ctx.fillText('之印', 0, sealSize * 0.28);
  ctx.restore();
  return new THREE.CanvasTexture(c);
}

/* 命牌背面纹理（金/暗木色 + 八卦小环） */
function createCardBackTexture({ color = '#D4A060' } = {}) {
  const W = 512, H = 768;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // 背景
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#3A2214');
  bg.addColorStop(0.5, '#4F2F1C');
  bg.addColorStop(1, '#2A1608');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 外圈：金漆描边
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(240,210,150,0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, W - 96, H - 96);
  // 中心大太极
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  // 阴
  ctx.beginPath();
  ctx.fillStyle = '#E8D4A0';
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  // 阳半圆
  ctx.beginPath();
  ctx.fillStyle = '#3A2214';
  ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  // 两个小圆
  ctx.beginPath();
  ctx.fillStyle = '#E8D4A0';
  ctx.arc(0, R / 2, R / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = '#3A2214';
  ctx.arc(0, -R / 2, R / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 环 8 卦字
  ctx.font = `600 ${W * 0.055}px "Ma Shan Zheng", serif`;
  ctx.fillStyle = 'rgba(240,210,150,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const trigrams = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
  const trR = R + W * 0.08;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    ctx.fillText(trigrams[i], cx + Math.cos(a) * trR, cy + Math.sin(a) * trR);
  }
  // 四角装饰
  const corner = (x, y, w, h) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  };
  corner(60, 60, 40, 40);
  corner(W - 60, 60, -40, 40);
  corner(60, H - 60, 40, -40);
  corner(W - 60, H - 60, -40, -40);
  return new THREE.CanvasTexture(c);
}

/* 命牌 3D 组件：前后两面 + 厚度 */
function DestinyCard({
  delay = 0.6,
  guaName = '大有',
  guaIcon = '☰',
  summary = '元亨利贞',
  keys = [],
  color = '#B83828',
}) {
  const cardGroup = useRef();
  const stateRef = useRef({
    t: 0, risen: false, flipped: false, stamped: false,
  });
  const { camera } = useThree();

  // BUG FIX: keys 安全兜底（非数组一律转空数组，避免 reading '0' of undefined）
  const safeKeys = Array.isArray(keys) ? keys : [];
  const k0 = safeKeys.length >= 1 ? safeKeys[0] : '天垂象';
  const k1 = safeKeys.length >= 2 ? safeKeys[1] : '利有攸往';
  const k2 = safeKeys.length >= 3 ? safeKeys[2] : '君子自强';

  const frontTex = useMemo(() => createCardFrontTexture({
    guaName: String(guaName || '大有').slice(0, 4),
    guaIcon: String(guaIcon || '☰').slice(0, 2),
    summary: String(summary || '元亨利贞').slice(0, 12),
    key1: k0, key2: k1, key3: k2,
    color: color || '#B83828',
  }), [guaName, guaIcon, summary, k0, k1, k2, color]);
  const backTex = useMemo(() => createCardBackTexture({ color: color || '#D4A060' }), [color]);

  // 牌尺寸
  const W = 1.6, H = 2.4, T = 0.08;

  useFrame((_, dtRaw) => {
    if (!cardGroup.current) return;
    const dt = Math.min(dtRaw, 0.05);
    stateRef.current.t += dt;
    const t = Math.max(0, stateRef.current.t - delay);
    // 1. 升起 (0-0.6s): 从屏幕下方浮到「光球的左前上方」，避开中央八卦罗盘 & 右侧命签面板
    //    终点位置：x 向左偏移 1.4，y 升到 1.9，z 推到 1.4（相机空间前方）
    const riseT = Math.min(1, t / 0.6);
    const easeRise = 1 - Math.pow(1 - riseT, 3);
    const y = -3 + (4.9) * easeRise;              // end y ≈ 1.9
    const z = -0.4 + (1.8) * easeRise;              // end z ≈ 1.4（浮到近前，不挡罗盘）
    const x = 0 + (-1.4) * easeRise;                // end x ≈ -1.4（左偏，避开右侧 FateCardPanel）
    // 2. 翻牌 (0.5-1.3s): rotY 0 → π
    const flipT = Math.max(0, Math.min(1, (t - 0.5) / 0.8));
    const easeFlip = flipT < 0.5 ? 2 * flipT * flipT : 1 - Math.pow(-2 * flipT + 2, 2) / 2;
    const rotY = -Math.PI * easeFlip;
    // 3. 浮动 (1.3s+): sin 上下 + 微自转
    let floatY = 0, floatRotY = 0, floatRotX = 0, floatZ = 0;
    if (flipT >= 1) {
      floatY = Math.sin(t * 1.2) * 0.07;
      floatRotY = Math.sin(t * 0.7) * 0.06;
      floatRotX = Math.sin(t * 0.5) * 0.04;
      floatZ = Math.sin(t * 0.9) * 0.04;
    }
    cardGroup.current.position.set(x, y + floatY, z + floatZ);
    // 轻微内倾 + 朝向相机，不跟罗盘/光球重叠
    cardGroup.current.rotation.set(
      -0.05 + floatRotX,
      rotY + 0.08 + floatRotY,
      0.03,
    );
  });

  return (
    <group ref={cardGroup} position={[0, -3, -0.4]}>
      {/* 正面 (朝向 -z, 翻完后对向屏幕) */}
      <mesh position={[0, 0, -T / 2]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={frontTex} roughness={0.7} metalness={0.08} transparent={false} />
      </mesh>
      {/* 背面 */}
      <mesh position={[0, 0, T / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={backTex} roughness={0.6} metalness={0.1} transparent={false} />
      </mesh>
      {/* 4 个侧面（简单box组合做厚度） */}
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[W, T, T]} />
        <meshStandardMaterial color="#3A2214" />
      </mesh>
      <mesh position={[0, -H / 2, 0]}>
        <boxGeometry args={[W, T, T]} />
        <meshStandardMaterial color="#3A2214" />
      </mesh>
      <mesh position={[-W / 2, 0, 0]}>
        <boxGeometry args={[T, H, T]} />
        <meshStandardMaterial color="#2A1608" />
      </mesh>
      <mesh position={[W / 2, 0, 0]}>
        <boxGeometry args={[T, H, T]} />
        <meshStandardMaterial color="#2A1608" />
      </mesh>
    </group>
  );
}

/* 命牌周围金色 halo 粒子 */
function CardHalo({ active = false }) {
  const ref = useRef();
  const startRef = useRef(-1);
  const count = 220;
  const [positions, phases, colors] = useMemo(() => {
    const p = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const co = new Float32Array(count * 3);
    const g = new THREE.Color('#F0D080');
    for (let i = 0; i < count; i++) {
      // 初始：以牌所在位置为中心的椭球
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.4 + Math.random() * 0.6;
      p[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      p[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8 + 0.4;
      p[i * 3 + 2] = r * Math.cos(phi);
      ph[i] = Math.random() * Math.PI * 2;
      const rr = 0.85 + Math.random() * 0.3;
      co[i * 3]     = Math.min(1, g.r * rr);
      co[i * 3 + 1] = Math.min(1, g.g * rr);
      co[i * 3 + 2] = Math.min(1, g.b * rr);
    }
    return [p, ph, co];
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    if (active && startRef.current < 0) startRef.current = t;
    const posAttr = ref.current.geometry.attributes.position;
    const arr = posAttr.array;
    for (let i = 0; i < count; i++) {
      const ang = phases[i] + t * 0.8;
      const r0 = 1.3 + 0.25 * Math.sin(ang);
      const theta = (i / count) * Math.PI * 2 + t * 0.3;
      const phi = Math.acos(Math.sin((i / count) * Math.PI + t * 0.15));
      arr[i * 3]     = r0 * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r0 * Math.sin(phi) * Math.sin(theta) * 0.75 + 0.35;
      arr[i * 3 + 2] = r0 * Math.cos(phi);
    }
    posAttr.needsUpdate = true;
    // opacity
    const k = startRef.current > 0 ? Math.min(1, (t - startRef.current) / 0.8) : 0;
    ref.current.material.opacity = 0.85 * k;
  });

  return (
    <points ref={ref} frustumCulled={false} visible={active}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color"    count={count} array={colors}    itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

export default function DestinyRevealFX({
  phase,
  oracle = null,
  dynamicChoices = [],
  selectedChoice = null,
  revealed = false,
}) {
  // ★ 修复：命牌页（path_reveal/final）不再渲染 3D 浮起命牌和金色粒子特效
  //   原设计：左前上方浮起一张命牌 + 周围光晕粒子
  //   用户反馈：视觉冗余，且这张牌与右侧 FateCardPanel 命牌面板内容重复、关系混乱
  //   新设计：所有命牌内容统一在右侧 FateCardPanel 显示，3D 场景留给中央八卦罗盘 & 智囊光球
  return (
    <group visible={false} position={[0, 0, 0]}>
      {/* 保持组件挂载接口不变，避免 Board/Board3D 报错；内容始终不显示 */}
    </group>
  );
}
