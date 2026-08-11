import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useReducedMotion } from 'framer-motion';
import * as THREE from 'three';
import { buildFateCardPresentation } from '../../game/fateCardPresentation';
import {
  createTrigramOrbit,
  DESTINY_ARCHIVE_ARTWORK,
  resolveDestinyArtwork,
  shouldShowDestinyCeremony,
} from '../../game/destinyCeremonyModel';

const CARD_W = 1.46;
const CARD_H = 2.19;
const GOLD = '#d9b75f';
const MOON = '#fff8df';
const JADE = '#dff8eb';
const CINNABAR = '#b94732';

function shortText(value, length = 20, fallback = '') {
  const text = String(value || '').replace(/[_*#`]+/g, '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, length);
}

function hexagramName(oracle, fallback = '本卦') {
  if (typeof oracle?.primary === 'string') return shortText(oracle.primary, 5, fallback);
  const name = oracle?.primary?.name || [oracle?.primary?.lower?.name, oracle?.primary?.upper?.name].filter(Boolean).join('');
  return shortText(oracle?.gua || name, 5, fallback);
}

function drawGlowText(ctx, text, x, y, font, color = MOON, blur = 12, align = 'center') {
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawYao(ctx, x, y, width, broken, alpha = 1) {
  ctx.save();
  ctx.fillStyle = `rgba(255,244,201,${alpha})`;
  ctx.shadowColor = '#fff2bd';
  ctx.shadowBlur = 12;
  const h = 7;
  if (broken) {
    const part = width * 0.41;
    ctx.fillRect(x - width / 2, y - h / 2, part, h);
    ctx.fillRect(x + width / 2 - part, y - h / 2, part, h);
  } else {
    ctx.fillRect(x - width / 2, y - h / 2, width, h);
  }
  ctx.restore();
}

function createFrontTexture({ guaName, guaIcon, question, title, summary, keys, lineMeta, sourceMark }) {
  const W = 640;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,9,7,.2)';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,232,154,.82)';
  ctx.lineWidth = 3;
  ctx.strokeRect(32, 28, W - 64, H - 56);
  ctx.strokeStyle = 'rgba(255,244,204,.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 44, W - 96, H - 88);
  ctx.strokeRect(58, 54, W - 116, H - 108);

  const meta = Array.isArray(lineMeta) ? lineMeta : [];
  for (let i = 0; i < 6; i += 1) {
    const value = meta[i]?.value ?? meta[i]?.yinYang ?? meta[i]?.type;
    const broken = value === 0 || value === 'yin' || value === '阴' || value === 'broken';
    drawYao(ctx, W / 2, 96 + i * 18, 122, broken, 0.48 + i * 0.07);
  }

  drawGlowText(ctx, '易 · 本局命牌', W / 2, 220, '500 20px "STKaiti", serif', '#e7c96f', 7);
  drawGlowText(ctx, shortText(guaName, 5, '本卦'), W / 2, 310, '700 88px "STKaiti", "KaiTi", serif', MOON, 22);
  drawGlowText(ctx, shortText(guaIcon, 3, '☯'), W / 2, 412, '500 104px "STKaiti", serif', '#fff0a8', 28);

  ctx.strokeStyle = 'rgba(231,202,111,.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(110, 492);
  ctx.lineTo(W - 110, 492);
  ctx.stroke();
  drawGlowText(ctx, '所问', 104, 532, '500 17px "STKaiti", serif', '#bda65e', 4, 'left');
  drawGlowText(ctx, shortText(question, 22, '本局所问'), 170, 532, '500 22px "STKaiti", "KaiTi", serif', '#dff1e5', 6, 'left');
  if (title) drawGlowText(ctx, shortText(title, 20), W / 2, 594, '600 30px "STKaiti", "KaiTi", serif', '#fff9e8', 8);
  if (summary) drawGlowText(ctx, shortText(summary, 28), W / 2, 634, '500 18px "STKaiti", "KaiTi", serif', '#d9d1bf', 4);

  const actions = (Array.isArray(keys) ? keys : []).filter(Boolean).slice(0, 3);
  actions.forEach((item, index) => {
    const y = 706 + index * 58;
    drawGlowText(ctx, String(index + 1).padStart(2, '0'), 116, y, '600 18px Georgia, serif', '#d9b75f', 5, 'left');
    drawGlowText(ctx, shortText(item?.label || item?.title || item, 18), 172, y, '500 25px "STKaiti", "KaiTi", serif', index === 0 ? '#fff9e7' : '#dff1e5', 7, 'left');
  });

  ctx.save();
  ctx.translate(W - 118, H - 116);
  ctx.rotate(-0.06);
  ctx.fillStyle = 'rgba(185,71,50,.88)';
  ctx.strokeStyle = 'rgba(255,135,105,.9)';
  ctx.lineWidth = 3;
  ctx.shadowColor = CINNABAR;
  ctx.shadowBlur = 18;
  ctx.fillRect(-42, -42, 84, 84);
  ctx.strokeRect(-42, -42, 84, 84);
  drawGlowText(ctx, '演', 0, -10, '700 35px "STKaiti", serif', '#fff5df', 4);
  drawGlowText(ctx, '落印', 0, 22, '500 16px "STKaiti", serif', '#fff5df', 3);
  ctx.restore();

  ctx.save();
  ctx.translate(92, H - 96);
  ctx.fillStyle = sourceMark === '藏' ? 'rgba(107,91,60,.9)' : 'rgba(185,71,50,.9)';
  ctx.fillRect(-24, -24, 48, 48);
  drawGlowText(ctx, sourceMark || '灵', 0, 1, '700 24px "STKaiti", serif', '#fff5df', 3);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createBackTexture({ lineMeta }) {
  const W = 640;
  const H = 960;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#050605';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.65);
  glow.addColorStop(0, 'rgba(255,250,224,.32)');
  glow.addColorStop(0.5, 'rgba(217,183,95,.12)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(18,24,21,.42)';
  ctx.fillRect(38, 34, W - 76, H - 68);
  ctx.strokeStyle = 'rgba(255,235,167,.9)';
  ctx.lineWidth = 3;
  ctx.strokeRect(32, 28, W - 64, H - 56);
  ctx.strokeStyle = 'rgba(229,201,112,.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(49, 45, W - 98, H - 90);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  for (let ring = 0; ring < 3; ring += 1) {
    ctx.strokeStyle = `rgba(255,232,150,${0.5 - ring * 0.12})`;
    ctx.lineWidth = ring === 0 ? 3 : 1;
    ctx.beginPath();
    ctx.arc(0, 0, 130 + ring * 34, 0, Math.PI * 2);
    ctx.stroke();
  }
  drawGlowText(ctx, '☯', 0, 0, '500 178px "STKaiti", serif', '#fff6d7', 34);
  ['☰','☱','☲','☳','☴','☵','☶','☷'].forEach((glyph, index) => {
    const angle = index / 8 * Math.PI * 2 - Math.PI / 2;
    drawGlowText(ctx, glyph, Math.cos(angle) * 235, Math.sin(angle) * 235, '500 38px serif', '#e6c86e', 9);
  });
  ctx.restore();

  const meta = Array.isArray(lineMeta) ? lineMeta : [];
  for (let i = 0; i < 6; i += 1) {
    const value = meta[i]?.value ?? meta[i]?.yinYang ?? meta[i]?.type;
    drawYao(ctx, W / 2, 728 + i * 24, value === 0 || value === 'yin' || value === '阴', 0.58 + i * 0.05);
  }
  drawGlowText(ctx, '六爻待明 · 触牌揭示', W / 2, 882, '500 22px "STKaiti", serif', '#e5cf8b', 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createGlyphTexture(glyph, color = '#f6dda0', size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.48);
  glow.addColorStop(0, 'rgba(228,194,111,.18)');
  glow.addColorStop(1, 'rgba(228,194,111,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  drawGlowText(ctx, glyph, size / 2, size / 2, `500 ${Math.round(size * 0.5)}px "STKaiti", "KaiTi", serif`, color, size * 0.065);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function TrigramCrown({ active, reducedMotion }) {
  const groupRef = useRef();
  const orbit = useMemo(() => createTrigramOrbit(0.9), []);
  const glyphTextures = useMemo(() => orbit.map((item) => createGlyphTexture(item.glyph)), [orbit]);
  const yanTexture = useMemo(() => createGlyphTexture('演', '#fff5d3', 384), []);

  useEffect(() => () => {
    glyphTextures.forEach((texture) => texture.dispose());
    yanTexture.dispose();
  }, [glyphTextures, yanTexture]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();
    groupRef.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.14) * 0.055;
    groupRef.current.children.forEach((child, index) => {
      if (!child.material) return;
      const pulse = reducedMotion ? 0 : Math.sin(time * 1.05 - index * 0.48) * 0.08;
      child.material.opacity = active ? 0.52 + pulse : 0.22;
    });
  });

  return (
    <group ref={groupRef} position={[0, 2.63, 0.26]}>
      <sprite scale={[0.56, 0.56, 1]}>
        <spriteMaterial map={yanTexture} transparent opacity={active ? 0.78 : 0.42} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {orbit.map((item, index) => (
        <sprite key={item.glyph} position={[item.x, item.y, 0]} scale={[0.3, 0.3, 1]}>
          <spriteMaterial map={glyphTextures[index]} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
      <mesh>
        <ringGeometry args={[1.08, 1.088, 96]} />
        <meshBasicMaterial color={GOLD} transparent opacity={active ? 0.2 : 0.08} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function DestinyCard({ guaName, guaIcon, presentation, lineMeta, revealed, reducedMotion, artworkUrl }) {
  const groupRef = useRef();
  const stateRef = useRef({ elapsed: 0, revealElapsed: 0 });
  const front = useMemo(() => createFrontTexture({
    guaName,
    guaIcon,
    question: presentation.question,
    title: presentation.title,
    summary: presentation.summary,
    keys: presentation.actions,
    lineMeta,
    sourceMark: presentation.sourceMark,
  }), [guaName, guaIcon, presentation, lineMeta]);
  const back = useMemo(() => createBackTexture({ lineMeta }), [lineMeta]);
  const surface = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(artworkUrl || DESTINY_ARCHIVE_ARTWORK, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 8;
    }, undefined, () => {
      if ((artworkUrl || DESTINY_ARCHIVE_ARTWORK) === DESTINY_ARCHIVE_ARTWORK) return;
      loader.load(DESTINY_ARCHIVE_ARTWORK, (fallback) => {
        texture.image = fallback.image;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        fallback.dispose();
      });
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [artworkUrl]);

  useEffect(() => () => {
    front.dispose();
    back.dispose();
    surface.dispose();
  }, [back, front, surface]);

  useFrame((_, rawDelta) => {
    if (!groupRef.current) return;
    const delta = Math.min(rawDelta, 0.05);
    stateRef.current.elapsed += delta;
    stateRef.current.revealElapsed = revealed ? stateRef.current.revealElapsed + delta : 0;
    const rise = reducedMotion ? 1 : THREE.MathUtils.smoothstep(stateRef.current.elapsed, 0.08, 1.15);
    const flip = revealed && reducedMotion ? 1 : THREE.MathUtils.smoothstep(stateRef.current.revealElapsed, 0.08, 0.95);
    const float = !reducedMotion && flip > 0.98 ? Math.sin(stateRef.current.elapsed * 0.72) * 0.026 : 0;
    groupRef.current.position.set(0, -2.8 + rise * 4.02 + float, 0.58);
    groupRef.current.rotation.set(-0.025, -Math.PI * flip + Math.sin(stateRef.current.elapsed * 0.32) * 0.018, 0.01);
    const scale = 0.78 + rise * 0.16;
    groupRef.current.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} position={[0, -2.7, 0.58]}>
      <mesh position={[0, 0, -0.022]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={surface} color="#d8cba8" transparent opacity={1} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.034]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={front} transparent opacity={1} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={back} transparent opacity={1} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[CARD_W + 0.018, CARD_H + 0.018, 0.045]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.28} wireframe depthWrite={false} />
      </mesh>
      <pointLight position={[0, 0.05, 0.42]} color={revealed ? MOON : '#e8cd83'} intensity={revealed ? 0.8 : 0.45} distance={3.2} decay={2} />
    </group>
  );
}

function YaoIgnition({ active }) {
  const refs = useRef([]);
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    refs.current.forEach((mesh, index) => {
      if (!mesh) return;
      const wave = Math.max(0.12, Math.sin(time * 2.15 - index * 0.52));
      mesh.material.opacity = active ? 0.18 + wave * 0.72 : 0.08;
      mesh.scale.x = 0.82 + wave * 0.22;
    });
  });
  return (
    <group position={[0, 1.2, 0.84]}>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} ref={(node) => { refs.current[index] = node; }} position={[0, -0.29 + index * 0.115, 0]}>
          <planeGeometry args={[0.76, 0.022]} />
          <meshBasicMaterial color={index < 3 ? GOLD : MOON} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Halo({ active }) {
  const outerRef = useRef();
  const innerRef = useRef();
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (outerRef.current) {
      outerRef.current.rotation.z = time * 0.14;
      outerRef.current.material.opacity = active ? 0.22 + Math.sin(time) * 0.07 : 0.07;
    }
    if (innerRef.current) {
      innerRef.current.rotation.z = -time * 0.22;
      innerRef.current.material.opacity = active ? 0.3 + Math.sin(time * 1.3) * 0.08 : 0.08;
    }
  });
  return (
    <group position={[0, 1.18, 0.4]}>
      <mesh ref={outerRef}>
        <ringGeometry args={[0.73, 0.742, 96]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={innerRef}>
        <ringGeometry args={[0.57, 0.579, 72]} />
        <meshBasicMaterial color={JADE} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function DestinyRevealFX({ phase, oracle = null, dynamicChoices = [], selectedChoice = null, revealed = false, inference = null, artwork = null }) {
  const reducedMotion = useReducedMotion();
  const active = shouldShowDestinyCeremony(phase);
  const choice = useMemo(
    () => selectedChoice || dynamicChoices[0] || {},
    [dynamicChoices, selectedChoice],
  );
  const guaName = hexagramName(oracle, choice?.gua || '本卦');
  const guaIcon = oracle?.trigram || oracle?.primary?.symbol || choice?.trigram || '☯';
  const presentation = useMemo(() => {
    const base = buildFateCardPresentation({
      fateContent: choice?.fateContent || null,
      inference,
      selectedChoice: choice,
      question: choice?.question || oracle?.question || '',
    });
    return {
      ...base,
      summary: base.summary || shortText(oracle?.text || oracle?.tip || choice?.description, 56),
      actions: base.actions.length
        ? base.actions
        : (choice?.keyPoints || choice?.steps || oracle?.actions || []).slice(0, 3),
    };
  }, [choice, inference, oracle]);
  const lineMeta = oracle?.lineMeta || oracle?.lines || oracle?.yao || [];
  const artworkUrl = resolveDestinyArtwork(artwork, choice);

  if (!active) return null;
  return (
    <group position={[phase === 'final' ? -1.28 : -0.18, 0, 0]}>
      {!reducedMotion && <YaoIgnition active={!revealed} />}
      {!reducedMotion && <Halo active={revealed} />}
      <TrigramCrown active={revealed} reducedMotion={reducedMotion} />
      <DestinyCard guaName={guaName} guaIcon={guaIcon} presentation={presentation} lineMeta={lineMeta} revealed={revealed} reducedMotion={reducedMotion} artworkUrl={artworkUrl} />
    </group>
  );
}
