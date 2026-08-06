/* ============================================================
   【全新流程动画 2/3】立卦六爻汇聚 YaolinesFormation
   - 仅在 phase=oracle 时激活（所有Agent说完演总结时）
   - 6 条爻线（上爻→初爻）从外围 (radius=4.2) 旋转汇入围绕"演"字
   - 每爻线有阳(实) / 阴(虚) 两种显示
   - 每爻到达后闪一下朱砂色，再过渡到米白色，最后 6 爻同时发射光晕粒子
   - BUG FIX: 移除双层嵌套ref，改用 state 触发 halo
   ============================================================ */
import { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* 稳定 hash：同 session 同 question 得同卦象（6 爻 0/1 数组） */
function stableGua(question = '', session = '') {
  const s = `${question}|${session}|${Date.now().toString().slice(0, 4)}`;
  let h = 0xdeadbeef;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  const arr = [];
  for (let i = 0; i < 6; i++) {
    arr.push((Math.abs(h) >> i) & 1);
  }
  return arr; // arr[0]=初爻, arr[5]=上爻
}

/* 单条爻线：阳(实线box) / 阴(左右两段) */
function YaoLine({ yaoIdx /* 0-5: 初爻→上爻 */, yang /* 0/1 */, delay, onArrive }) {
  const groupRef = useRef();
  const lineRefA = useRef();
  const lineRefB = useRef();
  const state = useRef({ t: 0, done: false, visible: false, arrived: false });

  const COLOR_YANG = '#F8E6B8';
  const COLOR_YIN  = '#F0D890';
  const COLOR_ARRIVING = '#E88060';

  const lineWidth = 0.08;
  const lineLen = 1.5;
  const gap = 0.32;
  // 演字在 y≈1.6 左右，六条爻线围绕演字上下分布（y=1.15 ~ 2.0）
  const targetY = 1.15 + yaoIdx * 0.17;

  const startAngle = (yaoIdx * 1.047) + ((yaoIdx % 2 === 0) ? 0.4 : -0.3);
  const startX = Math.cos(startAngle) * 4.2;
  const startZ = Math.sin(startAngle) * 4.2;

  useEffect(() => {
    state.current.t = 0;
    state.current.done = false;
    state.current.visible = true;
    state.current.arrived = false;
  }, [delay]);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    if (!state.current.visible) return;
    const D = 1.4;
    const arrivalBlink = 0.22;
    state.current.t = Math.min(D + arrivalBlink + 0.1, state.current.t + dt);
    const t = state.current.t;
    const k = Math.max(0, Math.min(1, (t - delay) / D));
    const ease = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const x = startX * (1 - ease);
    const z = startZ * (1 - ease);
    const y = targetY + Math.sin(k * Math.PI) * 0.6;
    const rotY = startAngle + (1 - ease) * Math.PI;
    groupRef.current.position.set(x, y, z);
    groupRef.current.rotation.set(0, rotY, 0);
    let col = yang ? COLOR_YANG : COLOR_YIN;
    if (k >= 0.995) {
      const tt = (t - delay - D) / arrivalBlink;
      const blinkK = Math.max(0, Math.min(1, tt));
      const blinkFade = 1 - blinkK;
      const arriving = new THREE.Color(COLOR_ARRIVING);
      const finalCol = new THREE.Color(col);
      const mix = finalCol.clone().lerp(arriving, blinkFade * blinkFade);
      col = '#' + mix.getHexString();
      // 到达回调（只触发一次）
      if (!state.current.arrived && onArrive) {
        state.current.arrived = true;
        onArrive(yaoIdx);
      }
    }
    if (lineRefA.current) lineRefA.current.material.color.set(col);
    if (lineRefB.current && !yang) lineRefB.current.material.color.set(col);
    const op = Math.max(k, state.current.done ? 1 : 0.05);
    if (lineRefA.current) lineRefA.current.material.opacity = Math.min(1, op + 0.1);
    if (lineRefB.current && !yang) lineRefB.current.material.opacity = Math.min(1, op + 0.1);
    if (k >= 1 && !state.current.done && (t - delay) >= D + arrivalBlink) {
      state.current.done = true;
    }
  });

  // 阴爻：左右两段位置（修正版：避免之前的错误坐标）
  const halfLen = (lineLen - gap) / 2;
  const leftX = -(halfLen + gap / 2);
  const rightX = halfLen + gap / 2;

  return (
    <group ref={groupRef} position={[startX, targetY, startZ]}>
      {yang ? (
        <mesh ref={lineRefA}>
          <boxGeometry args={[lineLen, lineWidth, lineWidth]} />
          <meshStandardMaterial color={COLOR_YANG} emissive={COLOR_YANG} emissiveIntensity={0.25} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ) : (
        <>
          <mesh ref={lineRefA} position={[leftX, 0, 0]}>
            <boxGeometry args={[halfLen, lineWidth, lineWidth]} />
            <meshStandardMaterial color={COLOR_YIN} emissive={COLOR_YIN} emissiveIntensity={0.22} transparent opacity={0.1} depthWrite={false} />
          </mesh>
          <mesh ref={lineRefB} position={[rightX, 0, 0]}>
            <boxGeometry args={[halfLen, lineWidth, lineWidth]} />
            <meshStandardMaterial color={COLOR_YIN} emissive={COLOR_YIN} emissiveIntensity={0.22} transparent opacity={0.1} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/* 6 爻汇聚后总爆发：朱砂粒子 halo */
function FinalHalo({ fireKey }) {
  const ref = useRef();
  const tRef = useRef(-1);
  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const cx = 128, cy = 128;
    const grd = ctx.createRadialGradient(cx, cy, 5, cx, cy, 128);
    grd.addColorStop(0, 'rgba(240,190,120,0.95)');
    grd.addColorStop(0.3, 'rgba(220,130,90,0.55)');
    grd.addColorStop(1, 'rgba(240,190,120,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  // BUG FIX: fireKey 是简单原始类型，变化就触发一次
  useEffect(() => {
    if (fireKey == null || fireKey === 0 || fireKey === false) return;
    tRef.current = 0;
    if (ref.current) ref.current.visible = true;
  }, [fireKey]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    if (tRef.current < 0) return;
    tRef.current += dt;
    const t = tRef.current;
    const life = 1.6;
    const k = Math.min(1, t / life);
    const scale = 0.4 + k * 5.2;
    ref.current.scale.set(scale, scale, 1);
    ref.current.rotation.z += dt * 0.4;
    ref.current.material.opacity = Math.max(0, 0.9 * (1 - k) * (1 - k));
    if (k >= 1) {
      tRef.current = -1;
      ref.current.visible = false;
    }
  });

  return (
    <mesh ref={ref} position={[0, 1.55, 0]} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export default function YaolinesFormation({ phase, oracle = null, question = '', sessionId = '' }) {
  // 所有Agent说完→演总结→立卦(oracle)阶段才激活
  const active = phase === 'oracle';
  const yaoArr = useMemo(() => {
    if (oracle && Array.isArray(oracle.lines) && oracle.lines.length === 6) {
      return oracle.lines.map(v => (v === '1' || v === 1 || v === true || v === 'yang') ? 1 : 0);
    }
    return stableGua(question, sessionId);
  }, [oracle?.lines, question, sessionId, phase]);

  // 用一个简单递增的 fireKey 驱动FinalHalo（每次 phase 刚切到 oracle +1）
  const [haloKey, setHaloKey] = useState(0);
  const lastPhaseRef = useRef('');
  const arrivedCount = useRef(0);
  useEffect(() => {
    arrivedCount.current = 0;
    if (phase === 'oracle' && lastPhaseRef.current !== 'oracle') {
      // 等六爻动画差不多结束(0.14*5 + 1.4 + 0.22 ≈ 2.3s)，然后触发halo
      const t = setTimeout(() => {
        setHaloKey(k => k + 1);
      }, 2400);
      return () => clearTimeout(t);
    }
    lastPhaseRef.current = phase;
  }, [phase]);

  return (
    <group visible={!!active} position={[0, 0, 0]}>
      {yaoArr.map((yang, idx) => (
        <YaoLine
          key={`oracle-yao-${idx}-${yang}-${sessionId.slice(0, 6)}`}
          yaoIdx={idx}
          yang={yang}
          delay={idx * 0.14}
          onArrive={() => { arrivedCount.current += 1; }}
        />
      ))}
      <FinalHalo fireKey={haloKey} />
    </group>
  );
}
