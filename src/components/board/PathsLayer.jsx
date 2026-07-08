import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, getChoicePosition, getChoiceColor } from './layoutConfig';

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

function StairBlock({ position, delay, color = COLORS.stair.top, stepHeight = 0.15 }) {
  const meshRef = useRef();
  const [visible, setVisible] = useState(false);

  const mats = useMemo(
    () => makeBlockMaterials(COLORS.stair.top, COLORS.stair.left, COLORS.stair.right, 0.95),
    []
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.5, stepHeight, 0.5)), [stepHeight]);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const elapsed = clock.getElapsedTime();
    const targetY = position[1];
    const startY = targetY - 3;
    const riseProgress = visible ? Math.min(Math.max((elapsed - delay / 1000) * 2.5, 0), 1) : 0;
    const eased = 1 - Math.pow(1 - riseProgress, 3);
    meshRef.current.position.y = startY + (targetY - startY) * eased;
  });

  return (
    <group>
      <mesh ref={meshRef} position={[position[0], position[1] - 3, position[2]]} material={mats}>
        <boxGeometry args={[0.5, stepHeight, 0.5]} />
      </mesh>
      <lineSegments position={[position[0], position[1] - 3, position[2]]} geometry={edges}>
        <lineBasicMaterial color={COLORS.platform.edge} transparent opacity={visible ? 0.5 : 0} />
      </lineSegments>
    </group>
  );
}

function generateStairBlocks(targetPos, blockCount = 10) {
  const blocks = [];
  const startX = 0.9;
  const startY = 0.1;
  const startZ = 0;

  for (let i = 0; i < blockCount; i++) {
    const t = i / (blockCount - 1);
    const easeT = t * t * (3 - 2 * t);
    const x = startX + (targetPos.x - startX) * easeT;
    const y = startY + (targetPos.y - startY) * easeT + 0.12 * Math.sin(t * Math.PI);
    const z = startZ + (targetPos.z - startZ) * easeT;
    blocks.push({ position: [x, y, z], delay: i * 60, height: 0.12 + t * 0.06 });
  }
  return blocks;
}

function StairPath({ targetPos, color, visible }) {
  const blocks = useMemo(() => generateStairBlocks(targetPos, 10), [targetPos]);

  if (!visible) return null;

  return (
    <group>
      {blocks.map((block, i) => (
        <StairBlock
          key={i}
          position={block.position}
          delay={block.delay}
          color={color}
          stepHeight={block.height}
        />
      ))}
    </group>
  );
}

export default function PathsLayer({ nodes, currentNodeId, visitedNodes, revealedNodes, pathHistory, phase }) {
  const currentNode = currentNodeId ? nodes[currentNodeId] : null;
  const branches = currentNode?.branches || [];
  const showPaths = phase === 'branch_select';

  const paths = useMemo(() => {
    if (!showPaths || !branches.length) return [];
    return branches.map((branch, index) => {
      const pos = getChoicePosition(index, branches.length);
      const color = getChoiceColor(branch);
      return { key: branch.targetId, position: pos, color };
    });
  }, [showPaths, branches]);

  const historyPaths = useMemo(() => {
    if (!pathHistory || pathHistory.length < 2) return [];
    const result = [];
    for (let i = 0; i < pathHistory.length - 1; i++) {
      const fromId = pathHistory[i];
      const toId = pathHistory[i + 1];
      const fromNode = nodes[fromId];
      const toNode = nodes[toId];
      if (!fromNode || !toNode) continue;
      const branchIndex = fromNode.branches?.findIndex(b => b.targetId === toId);
      if (branchIndex === undefined || branchIndex < 0) continue;
      const total = fromNode.branches?.length || 1;
      const endPos = getChoicePosition(branchIndex, total);
      const color = getChoiceColor(fromNode.branches[branchIndex]);
      result.push({ key: `${fromId}-${toId}`, position: endPos, color });
    }
    return result;
  }, [pathHistory, nodes]);

  return (
    <group>
      {historyPaths.map(p => (
        <StairPath key={p.key} targetPos={p.position} color={p.color} visible={true} />
      ))}
      {paths.map(p => (
        <StairPath key={p.key} targetPos={p.position} color={p.color} visible={true} />
      ))}
    </group>
  );
}