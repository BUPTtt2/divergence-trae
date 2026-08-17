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
export default function LightOrb({ phase, position = [0, 1.5, 0], fateRevealed = false }) {
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
    </group>
  );
}
