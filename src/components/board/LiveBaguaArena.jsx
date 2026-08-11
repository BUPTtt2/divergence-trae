import { Html, Line } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { selectVisibleArenaNodes } from '../../game/arenaViewModel';

const HEIGHT_BY_KIND = Object.freeze({
  fact: 1.3,
  unknown: 1.05,
  evidence: 1.6,
  interjection: 1.85,
  advisor: 2.15,
  conclusion: 2.5,
});

const LINK_COLOR = Object.freeze({
  supports: '#69C7A2',
  blocks: '#8E87A8',
  active: '#F2E4AC',
  assigned: '#8F866E',
  contested: '#C96E61',
  conflict: '#D85F5F',
  revises: '#D9A36C',
  synthesizes: '#E8C670',
});

const LANE_BY_KIND = Object.freeze({
  fact: { x: -2.35, z: -0.3, step: 0.48 },
  unknown: { x: 2.35, z: -0.3, step: 0.48 },
  evidence: { x: -1.45, z: -2.05, step: 2.9 },
  advisor: { x: -2.25, z: -2.55, step: 1.5 },
  interjection: { x: -0.9, z: 1.95, step: 1.8 },
  conclusion: { x: 0, z: -1.55, step: 0 },
});

function layoutNodes(nodes) {
  const indexes = {};
  return nodes.map((node) => {
    const index = indexes[node.kind] || 0;
    indexes[node.kind] = index + 1;
    const lane = LANE_BY_KIND[node.kind] || { x: 0, z: 0, step: 0 };
    const total = nodes.filter((item) => item.kind === node.kind).length;
    const centeredIndex = index - (total - 1) / 2;
    const horizontal = ['advisor', 'evidence', 'interjection'].includes(node.kind);
    const vertical = ['fact', 'unknown'].includes(node.kind);
    return {
      ...node,
      scenePosition: [
        lane.x + (horizontal ? centeredIndex * lane.step : 0),
        (HEIGHT_BY_KIND[node.kind] || 1.3) + (vertical ? centeredIndex * lane.step : 0),
        lane.z,
      ],
    };
  });
}

function AnimatedTraceLine({ link, from, to, index }) {
  const ref = useRef();
  const isSignal = ['active', 'synthesizes', 'supports'].includes(link.kind);
  useFrame(({ clock }) => {
    const material = ref.current?.material;
    if (!material || !isSignal) return;
    const time = clock.getElapsedTime();
    material.opacity = 0.36 + Math.sin(time * 1.35 + index * 0.7) * 0.16;
    if ('dashOffset' in material) material.dashOffset = -time * 0.12;
  });
  return (
    <Line
      ref={ref}
      points={[from, to]}
      color={LINK_COLOR[link.kind] || '#8F866E'}
      lineWidth={link.kind === 'conflict' ? 1.35 : link.kind === 'active' ? 1.1 : 0.6}
      transparent
      opacity={link.kind === 'conflict' ? 0.58 : link.kind === 'active' ? 0.66 : 0.24}
      dashed={link.kind === 'blocks' || link.kind === 'contested' || isSignal}
      dashSize={isSignal ? 0.055 : 0.08}
      gapSize={isSignal ? 0.04 : 0.06}
    />
  );
}

function TraceLines({ view, nodes }) {
  const positionById = useMemo(() => new Map([
    ['core', [0, 1.35, 0]],
    ...nodes.map((node) => [node.id, node.scenePosition]),
  ]), [nodes]);

  const advisorSignals = nodes.filter((node) => node.kind === 'advisor').map((node) => ({
    id: `advisor-core:${node.id}`,
    from: node.id,
    to: 'core',
    kind: node.status === 'completed' ? 'supports' : 'assigned',
  }));
  const links = [...(view.links || []), ...advisorSignals.filter((signal) => !(view.links || []).some((link) => link.from === signal.from && link.to === 'core'))];
  return links.map((link, index) => {
    const from = positionById.get(link.from);
    const to = positionById.get(link.to);
    if (!from || !to) return null;
    return (
      <AnimatedTraceLine
        key={link.id}
        link={link}
        from={from}
        to={to}
        index={index}
      />
    );
  });
}

function EventNode({ node, active, onSelect }) {
  const position = node.scenePosition;
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[active ? 0.095 : 0.065, 20, 20]} />
        <meshBasicMaterial color={node.color} transparent opacity={active ? 0.95 : 0.58} />
      </mesh>
      <Html center distanceFactor={6.5} style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          className="live-bagua-node"
          data-kind={node.kind}
          data-status={node.status || 'idle'}
          data-active={active ? 'true' : 'false'}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(node);
          }}
          aria-label={`${node.label}：${node.detail}`}
        >
          <span>{node.label}</span>
          <small>{node.kind === 'advisor' ? node.perspective : node.kind === 'unknown' ? '仍未知' : node.source}</small>
        </button>
      </Html>
    </group>
  );
}

export default function LiveBaguaArena({ view, onSelectNode, presentationMode = false, hideAdvisorNodes = false, finalMode = false }) {
  if (presentationMode || !view || view.mode === 'idle' || view.mode === 'direct') return null;
  const visibleNodes = selectVisibleArenaNodes(view)
    .filter((node) => !(hideAdvisorNodes && node.kind === 'advisor'))
    .filter((node) => !finalMode || ['fact', 'evidence', 'advisor', 'conclusion'].includes(node.kind));
  const nodes = layoutNodes(visibleNodes);
  return (
    <group>
      <TraceLines view={view} nodes={nodes} />
      {nodes.map((node) => (
        <EventNode
          key={node.id}
          node={node}
          active={node.id === view.activeNodeId}
          onSelect={onSelectNode}
        />
      ))}
    </group>
  );
}
