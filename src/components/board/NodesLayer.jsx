import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, getChoiceColor, getChoicePosition } from './layoutConfig';

function makeBlockMaterials(topColor, leftColor, rightColor, opacity = 1) {
  const mk = (color) => new THREE.MeshStandardMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    roughness: 0.6,
    metalness: 0.1,
  });
  return [
    mk(rightColor), mk(leftColor), mk(topColor),
    mk(rightColor), mk(leftColor), mk(rightColor),
  ];
}

function CenterPlatform() {
  const glowRef = useRef();

  const platformMats = useMemo(
    () => makeBlockMaterials(
      COLORS.platform.top,
      COLORS.platform.left,
      COLORS.platform.right,
      1
    ),
    []
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 0.35, 2.2)), []);
  const bottomEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8, 0.25, 1.8)), []);

  useFrame(({ clock }) => {
    if (!glowRef.current) return;
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 0.4) * 0.03;
    glowRef.current.scale.set(pulse, 1, pulse);
    glowRef.current.material.opacity = 0.08 + Math.sin(t * 0.4) * 0.03;
  });

  return (
    <group position={[0, -0.1, 0]}>
      {/* 底层基座 */}
      <mesh position={[0, -0.2, 0]} material={makeBlockMaterials(
        COLORS.platform.bottom,
        COLORS.bgBottom,
        COLORS.bgFar,
        0.9
      )}>
        <boxGeometry args={[1.8, 0.25, 1.8]} />
      </mesh>
      <lineSegments position={[0, -0.2, 0]} geometry={bottomEdges}>
        <lineBasicMaterial color={COLORS.platform.edge} transparent opacity={0.5} />
      </lineSegments>

      {/* 主平台 */}
      <mesh position={[0, 0.1, 0]} material={platformMats} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.35, 2.2]} />
      </mesh>
      <lineSegments position={[0, 0.1, 0]} geometry={edges}>
        <lineBasicMaterial color={COLORS.platform.edge} transparent opacity={0.7} />
      </lineSegments>

      {/* 底部光晕 */}
      <mesh ref={glowRef} position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.8, 32]} />
        <meshBasicMaterial
          color={COLORS.gold.main}
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function ChoiceBlock({ branch, index, total, nodeId, onClick }) {
  const groupRef = useRef();
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  const pos = useMemo(() => getChoicePosition(index, total), [index, total]);
  const color = useMemo(() => getChoiceColor(branch), [branch]);
  const nodeLabel = branch?.label || nodeId;

  const blockMats = useMemo(
    () => makeBlockMaterials(
      hovered ? color : COLORS.bgTop,
      hovered ? color : COLORS.bgMid,
      hovered ? color : COLORS.bgBottom,
      hovered ? 0.9 : 0.7
    ),
    [hovered, color]
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 1.0, 0.9)), []);

  useEffect(() => {
    const delay = index * 180 + 300;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [index]);

  useFrame(({ clock }) => {
    if (!groupRef.current || !visible) return;
    const t = clock.getElapsedTime();
    const baseY = pos.y;
    const hoverBoost = hovered ? 0.18 : 0;
    groupRef.current.position.y = baseY + Math.sin(t * 0.5 + index * 0.4) * 0.05 + hoverBoost;
    groupRef.current.rotation.y = Math.sin(t * 0.1 + index) * 0.08 + pos.angle * 0.3;
  });

  if (!visible) return null;

  return (
    <group
      ref={groupRef}
      position={[pos.x, pos.y, pos.z]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
    >
      {/* 玻璃质感方块 */}
      <mesh material={blockMats}>
        <boxGeometry args={[0.9, 1.0, 0.9]} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={hovered ? 1 : 0.7} />
      </lineSegments>

      {/* 顶部宝石状光点 */}
      <mesh position={[0, 0.65, 0]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.2 : 0.6}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>

      {/* hover底部光晕 */}
      {hovered && (
        <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.8, 24]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      <Html position={[0, 1.0, 0]} center distanceFactor={5.5}>
        <div style={{
          padding: '5px 14px',
          borderRadius: '8px',
          backgroundColor: hovered ? color : 'rgba(88,72,104,0.85)',
          color: hovered ? '#fff' : COLORS.text.light,
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: '-apple-system, sans-serif',
          whiteSpace: 'nowrap',
          border: `1px solid ${hovered ? color : 'rgba(200,180,220,0.3)'}`,
          boxShadow: hovered ? `0 4px 16px ${color}50` : '0 2px 8px rgba(0,0,0,0.12)',
          letterSpacing: '0.03em',
          transition: 'all 0.2s ease',
        }}>
          {nodeLabel}
        </div>
      </Html>
    </group>
  );
}

function VisitedMarker({ position }) {
  const mats = useMemo(
    () => makeBlockMaterials(COLORS.bgMid, COLORS.bgBottom, COLORS.bgFar, 0.4),
    []
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, 0.5, 0.5)), []);

  return (
    <group position={position}>
      <mesh material={mats}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={COLORS.bgBottom} transparent opacity={0.4} />
      </lineSegments>
    </group>
  );
}

export default function NodesLayer({ nodes, currentNodeId, visitedNodes, revealedNodes, onNodeClick, phase }) {
  const currentNode = currentNodeId ? nodes[currentNodeId] : null;
  const branches = currentNode?.branches || [];
  const showChoices = phase === 'branch_select';

  const visitedMarkers = useMemo(() => {
    if (!nodes) return [];
    return Array.from(visitedNodes)
      .filter(id => id !== currentNodeId && id !== 'root')
      .map((id, i) => {
        const angle = (i / 8) * Math.PI * 2 + 0.3;
        const radius = 8 + (i % 3) * 1.5;
        return {
          id,
          position: [Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius],
          label: nodes[id]?.label || id,
        };
      });
  }, [visitedNodes, currentNodeId, nodes]);

  return (
    <group>
      <CenterPlatform />

      {showChoices && branches.map((branch, index) => (
        <ChoiceBlock
          key={branch.targetId}
          branch={branch}
          index={index}
          total={branches.length}
          nodeId={branch.targetId}
          onClick={() => onNodeClick(branch.targetId)}
        />
      ))}

      {visitedMarkers.map(marker => (
        <VisitedMarker key={marker.id} position={marker.position} />
      ))}
    </group>
  );
}