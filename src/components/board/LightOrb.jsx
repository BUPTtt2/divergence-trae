import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createBaguaCompassTexture, createGlowTexture } from '../../utils/trigramTextures';

const TRIGRAMS = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];
const PALACES = ['命', '兄', '夫', '子', '财', '疾', '迁', '奴', '官', '田', '福', '父'];

const PHASE_MOTION = Object.freeze({
  input: { speed: 0.12, radius: 0.78, depth: 0.38, lift: 0.04, pulse: 0.08 },
  casting: { speed: 0.25, radius: 0.9, depth: 0.5, lift: 0.1, pulse: 0.2 },
  yan_analyze: { speed: 0.34, radius: 0.98, depth: 0.58, lift: 0.14, pulse: 0.28 },
  clarify_loop: { speed: 0.22, radius: 0.9, depth: 0.54, lift: 0.1, pulse: 0.18 },
  case_file_confirm: { speed: 0.16, radius: 0.82, depth: 0.45, lift: 0.06, pulse: 0.1 },
  agent_select: { speed: 0.32, radius: 1.03, depth: 0.62, lift: 0.12, pulse: 0.25 },
  agent_debate: { speed: 0.54, radius: 1.12, depth: 0.72, lift: 0.18, pulse: 0.38 },
  summary: { speed: 0.2, radius: 0.86, depth: 0.48, lift: 0.06, pulse: 0.12 },
  oracle: { speed: 0.28, radius: 0.94, depth: 0.6, lift: 0.12, pulse: 0.22 },
  branch_select: { speed: 0.14, radius: 0.78, depth: 0.4, lift: 0.04, pulse: 0.08 },
  path_reveal: { speed: 0.18, radius: 0.82, depth: 0.48, lift: 0.06, pulse: 0.1 },
  committing: { speed: 0.12, radius: 0.74, depth: 0.4, lift: 0.04, pulse: 0.08 },
  final: { speed: 0.08, radius: 0.68, depth: 0.36, lift: 0.02, pulse: 0.04 },
});

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createCalligraphyTexture(glyph, size = 256, strength = 1) {
  return canvasTexture(size, (context) => {
    const center = size / 2;
    const glow = context.createRadialGradient(center, center, 2, center, center, size * 0.48);
    glow.addColorStop(0, `rgba(238,205,120,${0.18 * strength})`);
    glow.addColorStop(0.52, `rgba(214,172,82,${0.07 * strength})`);
    glow.addColorStop(1, 'rgba(8,7,6,0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `600 ${Math.round(size * 0.54)}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`;
    context.shadowColor = 'rgba(248,221,150,.92)';
    context.shadowBlur = size * 0.07;
    context.fillStyle = 'rgba(247,224,166,.95)';
    context.fillText(glyph, center, center + size * 0.025);
  });
}

function createZiweiTexture(size = 512) {
  return canvasTexture(size, (context) => {
    const center = size / 2;
    context.translate(center, center);
    context.strokeStyle = 'rgba(224,192,112,.66)';
    context.lineWidth = 1.5;
    [0.46, 0.33, 0.2].forEach((radius, index) => {
      context.globalAlpha = 0.78 - index * 0.16;
      context.beginPath();
      context.arc(0, 0, size * radius, 0, Math.PI * 2);
      context.stroke();
    });
    context.globalAlpha = 0.64;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `500 ${Math.round(size * 0.034)}px "STKaiti", serif`;
    context.fillStyle = '#ead298';
    PALACES.forEach((label, index) => {
      const angle = index / 12 * Math.PI * 2 - Math.PI / 2;
      const radius = size * 0.395;
      context.beginPath();
      context.moveTo(Math.cos(angle) * size * 0.2, Math.sin(angle) * size * 0.2);
      context.lineTo(Math.cos(angle) * size * 0.46, Math.sin(angle) * size * 0.46);
      context.stroke();
      context.fillText(label, Math.cos(angle + Math.PI / 12) * radius, Math.sin(angle + Math.PI / 12) * radius);
    });
    context.globalAlpha = 1;
    context.font = `600 ${Math.round(size * 0.12)}px "Ma Shan Zheng", serif`;
    context.shadowColor = '#d3a94f';
    context.shadowBlur = 18;
    context.fillText('合', 0, 2);
  });
}

function BaguaCompass({ compact = false }) {
  const plateRef = useRef();
  const glowRef = useRef();
  const texture = useMemo(() => createBaguaCompassTexture(768), []);
  const glow = useMemo(() => createGlowTexture('#d5ae58', 256), []);
  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();
    if (plateRef.current) plateRef.current.rotation.z += delta * 0.025;
    if (glowRef.current) {
      const pulse = 1 + Math.sin(time * 0.48) * 0.035;
      glowRef.current.scale.set(pulse, pulse, 1);
      glowRef.current.material.opacity = 0.1 + Math.sin(time * 0.42) * 0.018;
    }
  });
  return (
    <group
      position={compact ? [-1.28, 0.08, -0.08] : [0, 0.08, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={compact ? [0.7, 0.7, 0.7] : [1, 1, 1]}
    >
      <mesh ref={glowRef} position={[0, 0, -0.04]}>
        <planeGeometry args={[3.5, 3.5]} />
        <meshBasicMaterial map={glow} transparent opacity={0.11} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={plateRef}>
        <circleGeometry args={[1.38, 96]} />
        <meshBasicMaterial map={texture} transparent opacity={0.94} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CenterSymbol({ phase, position }) {
  const groupRef = useRef();
  const glowRef = useRef();
  const symbol = useMemo(() => createCalligraphyTexture('演', 384, 1.3), []);
  const glow = useMemo(() => createGlowTexture('#d2a24d', 256), []);
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (groupRef.current) {
      const breath = 1 + Math.sin(time * 0.62) * 0.035;
      groupRef.current.scale.setScalar(breath);
      groupRef.current.position.y = position[1] + Math.sin(time * 0.46) * 0.045;
    }
    if (glowRef.current) glowRef.current.material.opacity = 0.18 + Math.sin(time * 0.8) * 0.045;
  });
  const quiet = ['summary', 'branch_select'].includes(phase);
  return (
    <group ref={groupRef} position={position}>
      <sprite ref={glowRef} scale={[quiet ? 1.35 : 1.7, quiet ? 1.35 : 1.7, 1]}>
        <spriteMaterial map={glow} transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite scale={[quiet ? 0.54 : 0.68, quiet ? 0.54 : 0.68, 1]}>
        <spriteMaterial map={symbol} transparent opacity={quiet ? 0.7 : 0.94} depthWrite={false} />
      </sprite>
    </group>
  );
}

function OrbitTrigrams({ phase, position }) {
  const refs = useRef([]);
  const ringA = useRef();
  const ringB = useRef();
  const motionRef = useRef({ ...PHASE_MOTION.input, angle: 0 });
  const textures = useMemo(() => TRIGRAMS.map((glyph) => createCalligraphyTexture(glyph, 192, 0.86)), []);
  useFrame(({ camera, clock }, delta) => {
    const target = PHASE_MOTION[phase] || PHASE_MOTION.input;
    const current = motionRef.current;
    const mix = Math.min(1, delta * 1.5);
    ['speed', 'radius', 'depth', 'lift', 'pulse'].forEach((key) => { current[key] += (target[key] - current[key]) * mix; });
    current.angle += delta * current.speed;
    const time = clock.getElapsedTime();
    refs.current.forEach((sprite, index) => {
      if (!sprite) return;
      const angle = current.angle + index / 8 * Math.PI * 2;
      sprite.position.set(
        position[0] + Math.cos(angle) * current.radius,
        position[1] + Math.sin(angle * 2 + time * 0.28) * current.lift,
        position[2] + Math.sin(angle) * current.depth,
      );
      sprite.lookAt(camera.position);
      const foreground = (Math.sin(angle) + 1) / 2;
      const pulse = Math.sin(time * 1.35 - index * 0.58) * current.pulse;
      const scale = 0.205 + foreground * 0.075 + pulse * 0.025;
      sprite.scale.set(scale, scale, 1);
      sprite.material.opacity = 0.42 + foreground * 0.46 + pulse * 0.2;
    });
    if (ringA.current) ringA.current.rotation.z = current.angle * 0.38;
    if (ringB.current) ringB.current.rotation.z = -current.angle * 0.25;
  });
  return (
    <group>
      <group position={position} rotation={[Math.PI / 2.08, 0.14, -0.08]}>
        <mesh ref={ringA}>
          <torusGeometry args={[0.9, 0.004, 6, 96]} />
          <meshBasicMaterial color="#d6af59" transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={ringB} rotation={[0.18, 0.08, 0]}>
          <torusGeometry args={[1.02, 0.0025, 6, 96]} />
          <meshBasicMaterial color="#ecda9b" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      {TRIGRAMS.map((glyph, index) => (
        <sprite key={glyph} ref={(node) => { refs.current[index] = node; }}>
          <spriteMaterial map={textures[index]} transparent opacity={0.72} depthTest depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function ZiweiDisk({ visible }) {
  const groupRef = useRef();
  const innerRef = useRef();
  const outerRef = useRef();
  const texture = useMemo(() => createZiweiTexture(), []);
  useFrame(({ camera, clock }) => {
    if (!visible || !groupRef.current) return;
    const time = clock.getElapsedTime();
    groupRef.current.lookAt(camera.position);
    groupRef.current.position.y = 1.46 + Math.sin(time * 0.35) * 0.035;
    if (innerRef.current) innerRef.current.rotation.z = time * 0.1;
    if (outerRef.current) outerRef.current.rotation.z = -time * 0.16;
  });
  return (
    <group ref={groupRef} visible={visible} position={[0, 1.46, 0.3]} scale={[0.82, 0.82, 0.82]}>
      <mesh ref={innerRef}>
        <circleGeometry args={[0.78, 72]} />
        <meshBasicMaterial map={texture} transparent opacity={0.62} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={outerRef} position={[0, 0, -0.035]}>
        <torusGeometry args={[0.88, 0.009, 8, 96]} />
        <meshBasicMaterial color="#d7b45f" transparent opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function FlowParticles({ phase, position }) {
  const refs = useRef([]);
  const glow = useMemo(() => createGlowTexture('#e2bd68', 96), []);
  const particles = useMemo(() => Array.from({ length: 28 }, (_, index) => ({
    angle: index / 28 * Math.PI * 2,
    radius: 0.62 + (index % 7) * 0.085,
    speed: 0.18 + (index % 5) * 0.035,
    offset: (index * 1.618) % (Math.PI * 2),
  })), []);
  const active = ['casting', 'yan_analyze', 'clarify_loop', 'agent_select', 'agent_debate', 'summary'].includes(phase);
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    refs.current.forEach((sprite, index) => {
      if (!sprite) return;
      const particle = particles[index];
      const intensity = phase === 'agent_debate' ? 1.55 : phase === 'summary' ? 0.62 : 1;
      const angle = particle.angle + time * particle.speed * intensity;
      const radius = particle.radius + Math.sin(time * 0.46 + particle.offset) * 0.09;
      sprite.position.set(
        position[0] + Math.cos(angle) * radius,
        position[1] + Math.sin(time * 0.7 + particle.offset) * 0.32,
        position[2] + Math.sin(angle) * radius * 0.62,
      );
      const pulse = 0.035 + (Math.sin(time * 1.4 + particle.offset) + 1) * 0.012;
      sprite.scale.set(pulse, pulse, 1);
      sprite.material.opacity = active ? 0.18 + (Math.sin(time + particle.offset) + 1) * 0.14 : 0;
    });
  });
  return (
    <group visible={active}>
      {particles.map((particle, index) => (
        <sprite key={`${particle.angle}:${index}`} ref={(node) => { refs.current[index] = node; }}>
          <spriteMaterial map={glow} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function YanAnalyzeRunes({ visible, position }) {
  const refs = useRef([]);
  const glyphs = useMemo(() => ['天', '地', '人', '和'], []);
  const textures = useMemo(() => glyphs.map((glyph) => createCalligraphyTexture(glyph, 224, 0.72)), [glyphs]);
  useFrame(({ camera, clock }) => {
    if (!visible) return;
    const time = clock.getElapsedTime();
    refs.current.forEach((sprite, index) => {
      if (!sprite) return;
      const angle = index / glyphs.length * Math.PI * 2 + time * 0.13;
      sprite.position.set(
        position[0] + Math.cos(angle) * 1.34,
        position[1] + Math.sin(time * 0.58 + index) * 0.44,
        position[2] + Math.sin(angle) * 0.82,
      );
      sprite.lookAt(camera.position);
      const scale = 0.27 + Math.sin(time * 0.82 + index) * 0.025;
      sprite.scale.set(scale, scale, 1);
      sprite.material.opacity = 0.38 + Math.sin(time * 0.74 + index) * 0.12;
    });
  });
  return (
    <group visible={visible}>
      {glyphs.map((glyph, index) => (
        <sprite key={glyph} ref={(node) => { refs.current[index] = node; }}>
          <spriteMaterial map={textures[index]} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </group>
  );
}

function wrapCardText(context, value, maxWidth, maxLines = 3) {
  const characters = String(value || '').split('');
  const lines = [];
  let current = '';
  for (const character of characters) {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
      if (lines.length === maxLines) break;
    } else current = candidate;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function FateCard({ visible, choice, activeAgents, inference, oracle }) {
  const cardRef = useRef();
  const { size } = useThree();
  const compact = size.width <= 900 || size.height > size.width;
  const fate = useMemo(() => {
    const fallback = [
      { name: '乾', trigram: '☰', element: '天', verse: '天行健，君子以自强不息。' },
      { name: '坤', trigram: '☷', element: '地', verse: '地势坤，君子以厚德载物。' },
      { name: '坎', trigram: '☵', element: '水', verse: '习坎，有孚，维心亨，行有尚。' },
      { name: '离', trigram: '☲', element: '火', verse: '明两作离，大人以继明照于四方。' },
      { name: '艮', trigram: '☶', element: '山', verse: '兼山艮，君子以思不出其位。' },
      { name: '巽', trigram: '☴', element: '风', verse: '随风巽，君子以申命行事。' },
      { name: '震', trigram: '☳', element: '雷', verse: '洊雷震，君子以恐惧修省。' },
      { name: '兑', trigram: '☱', element: '泽', verse: '丽泽兑，君子以朋友讲习。' },
    ];
    const seedText = `${choice?.id || ''}${choice?.label || ''}${inference?.summary || inference?.masterSummary || ''}`;
    const seed = [...seedText].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const safeFallback = fallback[seed % fallback.length];
    const primary = oracle?.primary || oracle || inference?.oracle?.primary || inference?.oracle || inference?.gua || {};
    const name = primary.name || primary.gua || primary.label || choice?.gua || safeFallback.name;
    const trigram = primary.trigram || oracle?.trigram || choice?.trigram || safeFallback.trigram;
    const element = primary.element || oracle?.element || choice?.element || safeFallback.element;
    const verse = inference?.verse || oracle?.verse || oracle?.text || oracle?.tip || choice?.verse || safeFallback.verse;
    const now = new Date();
    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const pillar = (value) => stems[((value % 10) + 10) % 10] + branches[((value % 12) + 12) % 12];
    return {
      name,
      trigram,
      element,
      verse,
      question: inference?.question || choice?.question || '本局所问',
      decision: choice?.label || choice?.title || inference?.recommendation || '审势而行',
      verdict: inference?.masterSummary || inference?.summary || choice?.verdict || '照见条件，保留转圜。',
      powerfulQuestion: inference?.powerfulQuestion || inference?.question || '',
      framework: inference?.framework || inference?.recommendation || choice?.summary || '',
      pillars: [pillar(now.getFullYear() + 4), pillar(now.getMonth() + 1 + now.getFullYear()), pillar(now.getDate() + (now.getMonth() + 1) * 3), pillar(now.getHours() + now.getDate() * 2)],
      advisors: (activeAgents || []).filter((agent) => agent?.role !== 'master').map((agent) => agent.name).filter(Boolean).join('、'),
      date: `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`,
    };
  }, [activeAgents, choice, inference, oracle]);
  const texture = useMemo(() => {
    const width = 360;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(28, 22, 14, 0.96)');
    gradient.addColorStop(0.5, 'rgba(18, 14, 8, 0.96)');
    gradient.addColorStop(1, 'rgba(8, 6, 4, 0.96)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 80; index += 1) {
      context.fillStyle = `rgba(200, 168, 80, ${0.012 + (index % 7) * 0.004})`;
      context.fillRect((index * 97) % width, (index * 211) % height, 1, 1);
    }
    context.strokeStyle = '#7a6a50';
    context.lineWidth = 1;
    context.shadowColor = 'rgba(200, 168, 80, 0.18)';
    context.shadowBlur = 4;
    context.strokeRect(16, 16, width - 32, height - 32);
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(122, 106, 80, 0.5)';
    context.beginPath();
    context.moveTo(40, 88);
    context.lineTo(width - 40, 88);
    context.stroke();
    context.textAlign = 'center';
    context.font = '600 22px "Ma Shan Zheng", serif';
    context.fillStyle = '#f0d890';
    context.shadowColor = '#c8a850';
    context.shadowBlur = 10;
    context.fillText('天 命 所 归', width / 2, 50);
    context.shadowBlur = 0;
    context.font = '10px "Noto Serif SC", serif';
    context.fillStyle = '#a08860';
    context.fillText(fate.date, width / 2, 70);

    const centerX = width / 2;
    const centerY = 152;
    const radius = 36;
    context.fillStyle = '#f0d890';
    context.beginPath(); context.arc(centerX, centerY, radius, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#1a1410';
    context.beginPath(); context.arc(centerX, centerY, radius, Math.PI / 2, Math.PI * 1.5, true); context.fill();
    context.fillStyle = '#f0d890';
    context.beginPath(); context.arc(centerX, centerY - radius / 2, radius / 2, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#1a1410';
    context.beginPath(); context.arc(centerX, centerY + radius / 2, radius / 2, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.arc(centerX, centerY + radius / 2, radius * 0.18, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#c8a850';
    context.beginPath(); context.arc(centerX, centerY - radius / 2, radius * 0.18, 0, Math.PI * 2); context.fill();
    context.font = '11px "Ma Shan Zheng", serif';
    TRIGRAMS.forEach((trigram, index) => {
      const angle = index / 8 * Math.PI * 2 - Math.PI / 2;
      context.fillText(trigram, centerX + Math.cos(angle) * (radius + 14), centerY + Math.sin(angle) * (radius + 14));
    });
    context.font = '700 38px "Ma Shan Zheng", serif';
    context.fillStyle = '#f0d890';
    context.shadowColor = '#c8a850';
    context.shadowBlur = 14;
    context.fillText(fate.name, width / 2, 240);
    context.shadowBlur = 0;
    context.font = '11px "Noto Serif SC", serif';
    context.fillStyle = '#a08860';
    context.fillText(`五行属 ${fate.element} · ${fate.trigram}`, width / 2, 262);
    context.font = '500 12px "Noto Serif SC", serif';
    context.fillStyle = '#e8d88a';
    const verseLines = wrapCardText(context, fate.verse, width - 80, 2);
    verseLines.forEach((line, index) => context.fillText(line, width / 2, 290 + index * 18));
    let y = 290 + verseLines.length * 18 + 18;
    context.strokeStyle = '#c8a85060';
    context.beginPath(); context.moveTo(40, y); context.lineTo(width - 40, y); context.stroke();
    y += 20;
    const drawArtifact = (label, value, fontSize = 12, color = '#e0ddd5', lineHeight = 18) => {
      if (!value) return;
      context.font = '600 9px "Noto Serif SC", serif';
      context.fillStyle = '#a08860';
      context.fillText(label, width / 2, y);
      y += 14;
      context.font = `${fontSize}px "Noto Serif SC", serif`;
      context.fillStyle = color;
      wrapCardText(context, value, width - 80, 3).forEach((line) => {
        context.fillText(line, width / 2, y);
        y += lineHeight;
      });
      y += 12;
    };
    drawArtifact('本 局 所 问', fate.question, 12, '#eee1bd');
    drawArtifact('一 句 反 问', fate.powerfulQuestion, 13, '#f0d890', 19);
    drawArtifact('决 策 所 择', fate.decision, 12, '#e0ddd5');
    drawArtifact('本 局 判 断', fate.verdict, 12, '#e0ddd5');
    y = Math.max(y + 4, 580);
    context.strokeStyle = '#c8a85060';
    context.beginPath(); context.moveTo(40, y); context.lineTo(width - 40, y); context.stroke();
    y += 18;
    context.font = '9px "Noto Serif SC", serif';
    context.fillStyle = '#807870';
    context.fillText('四 柱', width / 2, y);
    y += 16;
    fate.pillars.forEach((pillar, index) => {
      const columnWidth = (width - 80) / 4;
      context.font = '600 20px "Ma Shan Zheng", serif';
      context.fillStyle = '#f0d890';
      context.fillText(pillar, 40 + columnWidth * (index + 0.5), y);
    });
    if (fate.advisors) {
      context.font = '9px "Noto Serif SC", serif';
      context.fillStyle = '#807870';
      context.fillText(`智囊之议 · ${fate.advisors}`, width / 2, y + 25);
    }
    context.fillStyle = '#af3f29';
    context.fillRect(width - 65, height - 65, 34, 34);
    context.fillStyle = '#f0d890';
    context.font = '600 15px "Ma Shan Zheng", serif';
    context.fillText('演', width - 48, height - 43);
    const nextTexture = new THREE.CanvasTexture(canvas);
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.anisotropy = 8;
    return nextTexture;
  }, [fate]);
  useFrame(({ clock, camera }) => {
    if (!visible || !cardRef.current) return;
    const time = clock.getElapsedTime();
    cardRef.current.position.set(compact ? 0 : -2.05, compact ? 1.58 : 2.15, 0.24);
    cardRef.current.rotation.y = Math.sin(time * 0.28) * (compact ? 0.025 : 0.075);
    if (compact) cardRef.current.lookAt(camera.position);
  });
  return (
    <group ref={cardRef} visible={visible} scale={compact ? [0.72, 0.72, 0.72] : [1, 1, 1]}>
      <mesh>
        <planeGeometry args={[1.5, 3]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function LightOrb({ phase, position = [0, 1.5, 0], selectedChoice, activeAgents, inference, fateRevealed = false, oracle }) {
  const { size } = useThree();
  const compact = size.width <= 900 || size.height > size.width;
  const showFate = phase === 'final' || (fateRevealed && ['path_reveal', 'committing'].includes(phase));
  const effectPosition = showFate ? (compact ? [0, 1.58, 0.22] : [-2.05, 2.15, 0.22]) : position;
  return (
    <group>
      <BaguaCompass compact={showFate} />
      {!showFate && <>
        <CenterSymbol phase={phase} position={position} />
        <FlowParticles phase={phase} position={position} />
        <YanAnalyzeRunes visible={phase === 'yan_analyze' || phase === 'clarify_loop'} position={position} />
        <ZiweiDisk visible={phase === 'summary'} />
      </>}
      <OrbitTrigrams phase={phase} position={effectPosition} />
      <FateCard visible={showFate} choice={selectedChoice} activeAgents={activeAgents} inference={inference} oracle={oracle} />
    </group>
  );
}
